import { useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";

/* ================================================================
   河狸云 · 全景查看器 Demo
   Three.js 等距柱状投影全景图渲染
   支持拖拽旋转 / 惯性滑动 / 缩放 / 触屏手势 / 房间切换
   ================================================================ */

// 示例全景图（在线免费素材，拿到远洋真图后替换URL即可）
const DEMO_ROOMS = [
  { id: "living", name: "客厅", url: "https://threejs.org/examples/textures/equirectangular/royal_esplanade_1k.hdr", useColor: "#3a3530" },
  { id: "master", name: "主卧", useColor: "#4a4540" },
  { id: "kitchen", name: "厨房", useColor: "#35403a" },
  { id: "bath", name: "卫生间", useColor: "#384045" },
  { id: "study", name: "书房", useColor: "#40383a" },
];

// Since we can't load external HDR/images reliably in artifact, 
// we'll generate procedural panoramic scenes to demonstrate the interaction
function createPanoTexture(roomId, renderer) {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");

  const palettes = {
    living: { ceil: "#f5f2ee", wall: "#e8e4df", floor: "#c8c0b5", accent: "#8a7a6a", furniture: "#6b6560", window: "#b8cede" },
    master: { ceil: "#f0ede8", wall: "#e8dfd5", floor: "#a08868", accent: "#8b7355", furniture: "#c8b8a0", window: "#c5d8e8" },
    kitchen: { ceil: "#f2efeb", wall: "#f5f2ee", floor: "#b0aaa0", accent: "#5a5550", furniture: "#c4aa82", window: "#d0dae2" },
    bath: { ceil: "#eeecea", wall: "#e0ddd8", floor: "#a8a29a", accent: "#8aaa90", furniture: "#f0ece6", window: "#d8e4ee" },
    study: { ceil: "#f0ede8", wall: "#d8d0c5", floor: "#8a7660", accent: "#5c4a3a", furniture: "#6a7580", window: "#c5d0d8" },
  };

  const p = palettes[roomId] || palettes.living;
  const w = canvas.width, h = canvas.height;

  // Sky/ceiling (top quarter)
  ctx.fillStyle = p.ceil;
  ctx.fillRect(0, 0, w, h * 0.3);

  // Walls (middle)
  const wallGrad = ctx.createLinearGradient(0, h * 0.3, 0, h * 0.65);
  wallGrad.addColorStop(0, p.wall);
  wallGrad.addColorStop(1, p.wall);
  ctx.fillStyle = wallGrad;
  ctx.fillRect(0, h * 0.3, w, h * 0.35);

  // Floor (bottom)
  const floorGrad = ctx.createLinearGradient(0, h * 0.65, 0, h);
  floorGrad.addColorStop(0, p.floor);
  floorGrad.addColorStop(1, p.floor);
  ctx.fillStyle = floorGrad;
  ctx.fillRect(0, h * 0.65, w, h * 0.35);

  // Baseboard line
  ctx.strokeStyle = "rgba(0,0,0,0.08)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.65);
  ctx.lineTo(w, h * 0.65);
  ctx.stroke();

  // Ceiling line
  ctx.beginPath();
  ctx.moveTo(0, h * 0.3);
  ctx.lineTo(w, h * 0.3);
  ctx.stroke();

  // Windows (2 windows on the panorama)
  const drawWindow = (x, y, ww, wh) => {
    ctx.fillStyle = p.window;
    ctx.fillRect(x, y, ww, wh);
    ctx.strokeStyle = "rgba(0,0,0,0.06)";
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, ww, wh);
    // Cross bars
    ctx.beginPath();
    ctx.moveTo(x + ww / 2, y);
    ctx.lineTo(x + ww / 2, y + wh);
    ctx.moveTo(x, y + wh / 2);
    ctx.lineTo(x + ww, y + wh / 2);
    ctx.stroke();
    // Curtains
    ctx.fillStyle = "rgba(180,170,150,0.3)";
    ctx.fillRect(x - 15, y - 10, 20, wh + 20);
    ctx.fillRect(x + ww - 5, y - 10, 20, wh + 20);
  };

  drawWindow(w * 0.1, h * 0.32, w * 0.12, h * 0.25);
  drawWindow(w * 0.55, h * 0.32, w * 0.12, h * 0.25);

  // Room-specific furniture shapes
  if (roomId === "living") {
    // TV wall
    ctx.fillStyle = p.furniture;
    ctx.fillRect(w * 0.3, h * 0.32, w * 0.18, h * 0.3);
    // TV
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(w * 0.33, h * 0.35, w * 0.12, h * 0.15);
    ctx.fillStyle = "#0a0a12";
    ctx.fillRect(w * 0.335, h * 0.355, w * 0.11, h * 0.14);
    // Sofa (opposite side)
    ctx.fillStyle = "#8a8580";
    ctx.fillRect(w * 0.72, h * 0.5, w * 0.18, h * 0.12);
    ctx.fillStyle = "#7d7873";
    ctx.fillRect(w * 0.73, h * 0.46, w * 0.16, h * 0.06);
  } else if (roomId === "master") {
    // Bed headboard
    ctx.fillStyle = p.furniture;
    ctx.fillRect(w * 0.28, h * 0.38, w * 0.2, h * 0.08);
    // Bed
    ctx.fillStyle = "#d8cfc2";
    ctx.fillRect(w * 0.29, h * 0.46, w * 0.18, h * 0.15);
    // Pillows
    ctx.fillStyle = "#f0ece6";
    ctx.fillRect(w * 0.31, h * 0.47, w * 0.05, h * 0.04);
    ctx.fillRect(w * 0.40, h * 0.47, w * 0.05, h * 0.04);
    // Nightstands
    ctx.fillStyle = p.accent;
    ctx.fillRect(w * 0.25, h * 0.48, w * 0.03, h * 0.1);
    ctx.fillRect(w * 0.48, h * 0.48, w * 0.03, h * 0.1);
  } else if (roomId === "kitchen") {
    // Upper cabinets
    ctx.fillStyle = p.furniture;
    ctx.fillRect(w * 0.25, h * 0.32, w * 0.25, h * 0.1);
    // Counter
    ctx.fillStyle = "#ddd8d0";
    ctx.fillRect(w * 0.25, h * 0.52, w * 0.25, h * 0.03);
    // Lower cabinets
    ctx.fillStyle = p.furniture;
    ctx.fillRect(w * 0.25, h * 0.55, w * 0.25, h * 0.1);
    // Range hood
    ctx.fillStyle = "#b0ada8";
    ctx.fillRect(w * 0.33, h * 0.32, w * 0.08, h * 0.12);
    // Sink
    ctx.fillStyle = "rgba(0,0,0,0.05)";
    ctx.fillRect(w * 0.42, h * 0.52, w * 0.05, h * 0.025);
  } else if (roomId === "bath") {
    // Vanity
    ctx.fillStyle = p.furniture;
    ctx.fillRect(w * 0.28, h * 0.48, w * 0.12, h * 0.12);
    // Mirror
    ctx.fillStyle = "#d8e2ea";
    ctx.fillRect(w * 0.30, h * 0.34, w * 0.08, h * 0.13);
    // Shower area
    ctx.fillStyle = "rgba(200,220,235,0.15)";
    ctx.fillRect(w * 0.5, h * 0.3, w * 0.15, h * 0.35);
    ctx.strokeStyle = "rgba(200,220,235,0.3)";
    ctx.lineWidth = 2;
    ctx.strokeRect(w * 0.5, h * 0.3, w * 0.15, h * 0.35);
    // Shower head
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.arc(w * 0.575, h * 0.34, 8, 0, Math.PI * 2);
    ctx.fill();
    // Toilet
    ctx.fillStyle = "#f0ede8";
    ctx.fillRect(w * 0.75, h * 0.5, w * 0.05, h * 0.1);
    ctx.fillRect(w * 0.755, h * 0.45, w * 0.04, h * 0.06);
  } else if (roomId === "study") {
    // Bookshelf
    ctx.fillStyle = p.accent;
    ctx.fillRect(w * 0.25, h * 0.32, w * 0.12, h * 0.3);
    // Shelf lines
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(w * 0.26, h * (0.37 + i * 0.06));
      ctx.lineTo(w * 0.36, h * (0.37 + i * 0.06));
      ctx.stroke();
    }
    // Books (colored rectangles)
    const bookColors = ["#8b4513", "#2f4f4f", "#8b0000", "#2e4a62", "#6b4423"];
    for (let row = 0; row < 4; row++) {
      for (let b = 0; b < 4; b++) {
        ctx.fillStyle = bookColors[(row + b) % 5];
        ctx.globalAlpha = 0.4;
        ctx.fillRect(w * (0.265 + b * 0.022), h * (0.335 + row * 0.06), w * 0.018, h * (0.03 + (b % 3) * 0.005));
      }
    }
    ctx.globalAlpha = 1;
    // Desk
    ctx.fillStyle = p.furniture;
    ctx.fillRect(w * 0.42, h * 0.52, w * 0.15, h * 0.03);
    // Desk legs
    ctx.fillRect(w * 0.43, h * 0.55, w * 0.01, h * 0.08);
    ctx.fillRect(w * 0.55, h * 0.55, w * 0.01, h * 0.08);
    // Monitor
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(w * 0.46, h * 0.42, w * 0.07, h * 0.09);
    ctx.fillStyle = "#333";
    ctx.fillRect(w * 0.49, h * 0.51, w * 0.01, h * 0.015);
  }

  // Add subtle noise/grain for realism
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 8;
    data[i] = Math.min(255, Math.max(0, data[i] + noise));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
  }
  ctx.putImageData(imageData, 0, 0);

  // Room label watermark
  const roomNames = { living: "客厅", master: "主卧", kitchen: "厨房", bath: "卫生间", study: "书房" };
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.font = "bold 80px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(roomNames[roomId] || "", w * 0.5, h * 0.5);
  ctx.font = "28px sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fillText("河狸云 · 个性化精装 · 全景预览", w * 0.5, h * 0.55);

  // Note: with real panoramic photos, replace this entire function
  // with: new THREE.TextureLoader().load(imageURL)
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
}

function PanoViewer({ roomId, onReady }) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const sphereRef = useRef(null);
  const rafRef = useRef(null);
  const isDragging = useRef(false);
  const prevMouse = useRef({ x: 0, y: 0 });
  const velocity = useRef({ x: 0, y: 0 });
  const rotation = useRef({ lon: 0, lat: 0 });
  const targetFov = useRef(75);

  const initScene = useCallback(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const w = container.clientWidth;
    const h = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 1100);
    camera.position.set(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Sphere geometry (inside-out)
    const geometry = new THREE.SphereGeometry(500, 64, 32);
    geometry.scale(-1, 1, 1); // Flip to render inside

    const texture = createPanoTexture(roomId, renderer);
    const material = new THREE.MeshBasicMaterial({ map: texture });
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);
    sphereRef.current = sphere;

    // Animation loop
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);

      // Inertia
      if (!isDragging.current) {
        velocity.current.x *= 0.95;
        velocity.current.y *= 0.95;
        rotation.current.lon += velocity.current.x;
        rotation.current.lat += velocity.current.y;
      }

      // Auto-rotate when idle
      if (!isDragging.current && Math.abs(velocity.current.x) < 0.01 && Math.abs(velocity.current.y) < 0.01) {
        rotation.current.lon += 0.02;
      }

      // Clamp lat
      rotation.current.lat = Math.max(-85, Math.min(85, rotation.current.lat));

      // Smooth FOV
      camera.fov += (targetFov.current - camera.fov) * 0.1;
      camera.updateProjectionMatrix();

      // Convert to camera look-at
      const phi = THREE.MathUtils.degToRad(90 - rotation.current.lat);
      const theta = THREE.MathUtils.degToRad(rotation.current.lon);
      const target = new THREE.Vector3(
        500 * Math.sin(phi) * Math.cos(theta),
        500 * Math.cos(phi),
        500 * Math.sin(phi) * Math.sin(theta)
      );
      camera.lookAt(target);
      renderer.render(scene, camera);
    };
    animate();
    if (onReady) onReady();
  }, [roomId, onReady]);

  // Switch room texture
  useEffect(() => {
    if (sphereRef.current && rendererRef.current) {
      const newTexture = createPanoTexture(roomId, rendererRef.current);
      sphereRef.current.material.map = newTexture;
      sphereRef.current.material.needsUpdate = true;
    }
  }, [roomId]);

  // Init
  useEffect(() => {
    initScene();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (rendererRef.current && mountRef.current) {
        mountRef.current.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      }
    };
  }, []);

  // Resize
  useEffect(() => {
    const onResize = () => {
      if (!mountRef.current || !cameraRef.current || !rendererRef.current) return;
      const w = mountRef.current.clientWidth, h = mountRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Mouse / Touch events
  const onPointerDown = useCallback((e) => {
    isDragging.current = true;
    velocity.current = { x: 0, y: 0 };
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    prevMouse.current = { x: clientX, y: clientY };
  }, []);

  const onPointerMove = useCallback((e) => {
    if (!isDragging.current) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const dx = (clientX - prevMouse.current.x) * 0.15;
    const dy = (clientY - prevMouse.current.y) * 0.15;
    rotation.current.lon -= dx;
    rotation.current.lat += dy;
    velocity.current = { x: -dx, y: dy };
    prevMouse.current = { x: clientX, y: clientY };
  }, []);

  const onPointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const onWheel = useCallback((e) => {
    targetFov.current = Math.max(30, Math.min(100, targetFov.current + e.deltaY * 0.05));
  }, []);

  return (
    <div
      ref={mountRef}
      onMouseDown={onPointerDown}
      onMouseMove={onPointerMove}
      onMouseUp={onPointerUp}
      onMouseLeave={onPointerUp}
      onTouchStart={onPointerDown}
      onTouchMove={onPointerMove}
      onTouchEnd={onPointerUp}
      onWheel={onWheel}
      style={{ width: "100%", height: "100%", cursor: isDragging.current ? "grabbing" : "grab", touchAction: "none" }}
    />
  );
}

export default function App() {
  const [activeRoom, setActiveRoom] = useState("living");
  const [loaded, setLoaded] = useState(false);
  const rooms = DEMO_ROOMS;
  const roomNames = { living: "客厅", master: "主卧", kitchen: "厨房", bath: "卫生间", study: "书房" };

  return (
    <div style={{ width: "100%", height: "100vh", background: "#0a0f0d", position: "relative", overflow: "hidden", fontFamily: "'Noto Sans SC', -apple-system, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <style>{`* { box-sizing: border-box; margin: 0; }`}</style>

      {/* Panorama viewer */}
      <PanoViewer roomId={activeRoom} onReady={() => setLoaded(true)} />

      {/* Top bar */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "linear-gradient(180deg, rgba(10,15,13,0.8), transparent)", zIndex: 10, pointerEvents: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, pointerEvents: "auto" }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #2dd4a8, #1ab894)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#0a0f0d" }}>狸</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>河狸云 · 全景预览</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>贵阳远洋天铂 · A2户型 · 138㎡</div>
          </div>
        </div>
        <div style={{ pointerEvents: "auto", padding: "5px 14px", borderRadius: 8, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)", fontSize: 11 }}>
          拖拽旋转 · 滚轮缩放
        </div>
      </div>

      {/* Scene label */}
      <div style={{ position: "absolute", top: 70, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.4)", backdropFilter: "blur(10px)", padding: "6px 22px", borderRadius: 20, color: "white", fontSize: 13, fontWeight: 500, letterSpacing: 4, zIndex: 10 }}>
        {roomNames[activeRoom]}
      </div>

      {/* Room navigation */}
      <div style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 5, padding: 6, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(12px)", borderRadius: 12, zIndex: 10 }}>
        {rooms.map(r => (
          <button
            key={r.id}
            onClick={() => setActiveRoom(r.id)}
            style={{
              padding: "7px 18px", borderRadius: 8,
              background: activeRoom === r.id ? "rgba(45,212,168,0.2)" : "transparent",
              border: activeRoom === r.id ? "1px solid rgba(45,212,168,0.4)" : "1px solid transparent",
              color: activeRoom === r.id ? "#2dd4a8" : "rgba(255,255,255,0.4)",
              fontSize: 12, fontWeight: activeRoom === r.id ? 600 : 400,
              cursor: "pointer", transition: "all 0.2s ease",
            }}
          >
            {r.name}
          </button>
        ))}
      </div>

      {/* Compass indicator */}
      <div style={{ position: "absolute", bottom: 80, right: 20, width: 44, height: 44, borderRadius: "50%", background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
        <svg width="20" height="20" viewBox="0 0 20 20">
          <polygon points="10,2 7,12 10,10 13,12" fill="#2dd4a8" opacity="0.8" />
          <polygon points="10,18 7,8 10,10 13,8" fill="rgba(255,255,255,0.3)" />
        </svg>
      </div>

      {/* Info: replace instructions */}
      <div style={{ position: "absolute", bottom: 80, left: 20, maxWidth: 260, padding: "10px 14px", background: "rgba(0,0,0,0.5)", backdropFilter: "blur(10px)", borderRadius: 10, border: "1px solid rgba(45,212,168,0.15)", zIndex: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#2dd4a8", marginBottom: 4 }}>Demo 说明</div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", lineHeight: 1.5 }}>
          当前为程序生成的示意场景。拿到客户提供的等距柱状投影全景照片后，只需替换图片URL即可呈现真实样板间效果。交互体验（拖拽/缩放/房间切换）与最终版本一致。
        </div>
      </div>
    </div>
  );
}
