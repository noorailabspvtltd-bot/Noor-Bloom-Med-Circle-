import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { useAuth } from "@clerk/expo";
import { randomUUID } from "expo-crypto";
import { fetch as expoFetch } from "expo/fetch";
import { Directory, File, Paths } from "expo-file-system";
import { createState, type Action } from "./clinic";
import { cloudTransition } from "./cloud-transition";
import { apiUrl } from "./cloud-config";
import {
  cloudRequest,
  CloudError,
  readCloud,
  writeCloud,
  type CloudSnapshot,
  type CareSpace,
} from "./cloud-api";
import { ClinicContext } from "./store";
import { StartupLoader } from "./branding";

export function CloudClinicProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = useAuth();
  if (!auth.isLoaded) return <StartupLoader />;
  return (
    <CloudUserStore key={auth.userId || "signed-out"}>
      {children}
    </CloudUserStore>
  );
}
function CloudUserStore({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const [state, setState] = useState(createState);
  const [ready, setReady] = useState(!auth.isSignedIn);
  const [toast, setToast] = useState("");
  const [status, setStatus] = useState("Connecting");
  const [error, setError] = useState("");
  const [spaces, setSpaces] = useState<CareSpace[]>([]);
  const [spaceId, setSpaceId] = useState("");
  const base = useRef<CloudSnapshot | null>(null);
  const pending = useRef<{ action: Action; operationId: string }[]>([]);
  const processing = useRef(false);
  const generation = useRef(0);
  const loadSequence = useRef(0);
  const getToken = auth.getToken;
  const tokenGetter = useRef(getToken);
  const signingOut = useRef(false);
  useEffect(() => {
    tokenGetter.current = getToken;
  }, [getToken]);
  const token = useCallback(async () => {
    const value = await tokenGetter.current();
    if (!value) throw new Error("Sign in again to continue.");
    return value;
  }, []);
  const publish = () => {
    if (!base.current) return;
    let next = base.current.state;
    for (const entry of pending.current)
      next = cloudTransition(next, entry.action, entry.operationId);
    setState(next);
  };
  const load = useCallback(
    async (selected = "") => {
      if (processing.current) return;
      const epoch = generation.current;
      const ticket = ++loadSequence.current;
      try {
        const jwt = await token();
        setStatus("Connecting");
        setError("");
        const [snapshot, available] = await Promise.all([
          readCloud(jwt, selected),
          cloudRequest<CareSpace[]>(jwt, "/v1/spaces"),
        ]);
        if (
          epoch !== generation.current ||
          ticket !== loadSequence.current ||
          processing.current
        )
          return;
        base.current = snapshot;
        pending.current = [];
        setState(snapshot.state);
        setSpaceId(snapshot.spaceId);
        setSpaces(available);
        setStatus("Synced");
      } catch (e) {
        if (epoch !== generation.current) return;
        if (e instanceof CloudError && [401, 403].includes(e.status)) {
          base.current = null;
          pending.current = [];
          setState(createState());
        }
        setError(e instanceof Error ? e.message : "Could not connect.");
        setStatus("Connection failed");
      } finally {
        if (epoch === generation.current) setReady(true);
      }
    },
    [token],
  );
  useEffect(() => {
    if (!auth.isSignedIn) return;
    const lifecycle = generation;
    lifecycle.current++;
    // Hydrate external server state on authentication changes; this is not derived render state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      lifecycle.current++;
    };
  }, [auth.isSignedIn, load]);
  useEffect(() => {
    if (!auth.isSignedIn) return;
    const listener = AppState.addEventListener("change", (value) => {
      if (value === "active") void load(spaceId);
    });
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void load(spaceId);
    }, 30000);
    return () => {
      listener.remove();
      clearInterval(timer);
    };
  }, [auth.isSignedIn, load, spaceId]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  async function drain() {
    if (processing.current || !base.current) return;
    processing.current = true;
    const epoch = generation.current;
    setStatus("Saving");
    try {
      while (
        pending.current.length &&
        base.current &&
        epoch === generation.current
      ) {
        const entry = pending.current[0];
        const saved = await writeCloud(
          await token(),
          base.current.spaceId,
          base.current.revision,
          entry.action,
          entry.operationId,
        );
        if (epoch !== generation.current) return;
        base.current = saved;
        pending.current.shift();
        publish();
      }
      if (epoch === generation.current) {
        setStatus("Synced");
        setError("");
      }
    } catch (e) {
      if (epoch !== generation.current) return;
      pending.current = [];
      const message = e instanceof Error ? e.message : "Cloud save failed.";
      setError(message);
      setToast(
        message + " Unsaved changes were reverted. Refresh before retrying.",
      );
      setStatus("Save failed");
      if (e instanceof CloudError && [401, 403].includes(e.status)) {
        base.current = null;
        setState(createState());
      }
      try {
        if (base.current) {
          base.current = await readCloud(await token(), base.current.spaceId);
          publish();
        }
      } catch {
        publish();
      }
    } finally {
      if (epoch === generation.current) processing.current = false;
    }
  }
  function dispatch(action: Action) {
    if (action.type === "session") {
      setToast("Cloud roles are assigned by your care administrator.");
      return false;
    }
    if (!base.current || error) {
      setToast("Refresh your cloud connection before making changes.");
      return false;
    }
    try {
      const entry = { action, operationId: randomUUID() };
      let next = base.current.state;
      for (const queued of [...pending.current, entry])
        next = cloudTransition(next, queued.action, queued.operationId);
      pending.current.push(entry);
      setState(next);
      void drain();
      return true;
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Unable to update.");
      return false;
    }
  }
  async function upload(asset: {
    uri: string;
    name: string;
    mimeType?: string;
    file?: globalThis.File;
  }) {
    if (!base.current) throw new Error("Cloud connection is not ready.");
    const response = await expoFetch(
      apiUrl +
        "/v1/files?space=" +
        encodeURIComponent(base.current.spaceId) +
        "&name=" +
        encodeURIComponent(asset.name),
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + (await token()),
          "Content-Type": asset.mimeType || "application/octet-stream",
        },
        body: Platform.OS === "web" ? asset.file : new File(asset.uri),
      },
    );
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Upload failed.");
    return result as { fileId: string; mime: string };
  }
  async function download(fileId: string) {
    if (!base.current || Platform.OS === "web")
      throw new Error("Open attachments in the mobile app.");
    const epoch = generation.current;
    const response = await expoFetch(
      apiUrl +
        "/v1/files/" +
        encodeURIComponent(fileId) +
        "?space=" +
        encodeURIComponent(base.current.spaceId),
      { headers: { Authorization: "Bearer " + (await token()) } },
    );
    if (!response.ok)
      throw new Error("Could not download this private attachment.");
    if (epoch !== generation.current)
      throw new Error("Your account changed. Open this file again.");
    const extension = response.headers.get("Content-Type")?.includes("pdf")
      ? ".pdf"
      : ".image";
    const directory = new Directory(Paths.cache, "bloom-cloud-" + auth.userId);
    directory.create({ idempotent: true, intermediates: true });
    const file = new File(directory, "bloom-" + fileId + extension);
    file.create({ overwrite: true });
    file.write(new Uint8Array(await response.arrayBuffer()));
    return file.uri;
  }
  return (
    <ClinicContext.Provider
      value={{
        state,
        ready,
        toast,
        notify: setToast,
        dispatch,
        cloud: {
          status,
          error,
          spaces,
          spaceId,
          refresh: () => load(spaceId),
          select: async (value) => {
            if (processing.current) {
              setToast("Wait for your changes to finish saving.");
              return;
            }
            setReady(false);
            await load(value);
          },
          signOut: async () => {
            if (signingOut.current) return;
            signingOut.current = true;
            generation.current++;
            pending.current = [];
            try {
              await auth.signOut();
              base.current = null;
              if (Platform.OS !== "web") {
                try {
                  const directory = new Directory(
                    Paths.cache,
                    "bloom-cloud-" + auth.userId,
                  );
                  if (directory.exists) directory.delete();
                } catch {
                  /* Cache cleanup must not prevent account sign-out. */
                }
              }
            } catch (failure) {
              signingOut.current = false;
              throw failure;
            }
          },
          upload,
          download,
        },
      }}
    >
      {children}
    </ClinicContext.Provider>
  );
}
