let settings = {};
try {
  settings = JSON.parse(localStorage.getItem("settings")) || {};
} catch {}

const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
const initialBg = isDark ? "#121212" : "#ffffff";
document.documentElement.style.backgroundColor = initialBg;
document.documentElement.classList.toggle("dark", isDark);
document.documentElement.classList.toggle("light", !isDark);

/* Paint the wallpaper before the first frame: <body> doesn't exist yet, so
   inject CSS — it applies the moment the body is created. New tabs then open
   straight onto the real background (no color→image blink per load). */
try {
  const wallpaper = settings.backgroundImage || "";
  if (wallpaper && /^(https?:|data:)/i.test(wallpaper)) {
    const style = document.createElement("style");
    style.textContent =
      'body{background-image:url("' +
      wallpaper.replace(/"/g, "%22") +
      '");background-size:cover;background-position:center;}';
    document.head.appendChild(style);
  }
} catch {}


