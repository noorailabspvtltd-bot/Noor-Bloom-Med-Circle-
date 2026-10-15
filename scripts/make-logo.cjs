const fs = require("fs");
const { PNG } = require("pngjs");
const petals = Array.from({ length: 6 }, (_, i) => (i * Math.PI) / 3);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="256" fill="#147D68"/>${petals.map((a) => `<ellipse cx="512" cy="328" rx="94" ry="148" fill="#DBF6EB" transform="rotate(${(a * 180) / Math.PI} 512 512)"/>`).join("")}<circle cx="512" cy="512" r="132" fill="#147D68"/><path d="M484 426h56v58h58v56h-58v58h-56v-58h-58v-56h58z" fill="white"/></svg>`;
fs.writeFileSync("assets/bloom-logo.svg", svg);
function render(size, transparent = false) {
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let r = 0,
        g = 0,
        b = 0,
        alpha = 0;
      for (let sy = 0; sy < 2; sy++)
        for (let sx = 0; sx < 2; sx++) {
          const px = ((x + (sx + 0.5) / 2) / size) * 1024 - 512,
            py = ((y + (sy + 0.5) / 2) / size) * 1024 - 512;
          let c = transparent ? [0, 0, 0, 0] : [20, 125, 104, 255];
          for (const a of petals) {
            const u = px * Math.cos(a) + py * Math.sin(a),
              v = -px * Math.sin(a) + py * Math.cos(a);
            if (
              (u * u) / (94 * 94) + ((v + 184) * (v + 184)) / (148 * 148) <=
              1
            )
              c = [219, 246, 235, 255];
          }
          if (px * px + py * py < 132 * 132)
            c = transparent ? [20, 125, 104, 255] : [20, 125, 104, 255];
          if (
            (Math.abs(px) < 28 && Math.abs(py) < 86) ||
            (Math.abs(py) < 28 && Math.abs(px) < 86)
          )
            c = [255, 255, 255, 255];
          r += c[0];
          g += c[1];
          b += c[2];
          alpha += c[3];
        }
      const idx = (y * size + x) * 4;
      png.data[idx] = r / 4;
      png.data[idx + 1] = g / 4;
      png.data[idx + 2] = b / 4;
      png.data[idx + 3] = alpha / 4;
    }
  return PNG.sync.write(png);
}
fs.writeFileSync("assets/bloom-logo.png", render(1024));
fs.writeFileSync("assets/bloom-mark.png", render(1024, true));
