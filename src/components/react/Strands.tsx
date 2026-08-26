import { useEffect, useRef } from "react";
import { Color, Mesh, Program, Renderer, Triangle } from "ogl";
import { STRANDS_FRAGMENT, STRANDS_VERTEX } from "./StrandsShader";
import "./Strands.css";

interface StrandsProps {
  colors?: [string, string, string];
  lightColors?: [string, string, string];
  speed?: number;
  amplitude?: number;
  thickness?: number;
  glow?: number;
  className?: string;
}

const rgb = (value: string) => {
  const color = new Color(value);
  return [color.r, color.g, color.b];
};

export default function Strands({
  colors = ["#4f8dff", "#35c99a", "#e4a65a"],
  lightColors = ["#1f57c8", "#197f62", "#a96714"],
  speed = 0.5,
  amplitude = 1,
  thickness = 1,
  glow = 1.15,
  className = "",
}: StrandsProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const root = container?.closest<HTMLElement>("[data-strands-scroll-root]");
    const skipAnimation = window.matchMedia(
      "(max-width: 768px), (pointer: coarse), (prefers-reduced-motion: reduce)",
    ).matches;
    if (!container || !root || skipAnimation) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.35);
    const renderer = new Renderer({
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      dpr,
    });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const geometry = new Triangle(gl);
    if (geometry.attributes.uv) delete geometry.attributes.uv;
    const paletteForTheme = () =>
      (document.documentElement.dataset.theme === "light" ? lightColors : colors).map(rgb);
    const program = new Program(gl, {
      vertex: STRANDS_VERTEX,
      fragment: STRANDS_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: [1, 1] },
        uWorld: { value: [0, 0, 1, 1] },
        uColors: { value: paletteForTheme() },
        uSpeed: { value: speed },
        uAmplitude: { value: amplitude },
        uThickness: { value: thickness },
        uGlow: { value: glow },
        uDpr: { value: dpr },
      },
    });
    const mesh = new Mesh(gl, { geometry, program });
    container.appendChild(gl.canvas);

    let rootTop = 0;
    let rootHeight = 1;
    let lastScrollAt = performance.now();
    let lastRenderAt = 0;
    let frame = 0;

    const measure = () => {
      rootTop = root.getBoundingClientRect().top + window.scrollY;
      rootHeight = Math.max(root.scrollHeight, 1);
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      renderer.setSize(width, height);
      program.uniforms.uResolution.value = [gl.canvas.width, gl.canvas.height];
    };

    const onScroll = () => {
      lastScrollAt = performance.now();
    };
    const themeObserver = new MutationObserver(() => {
      program.uniforms.uColors.value = paletteForTheme();
      lastScrollAt = performance.now();
    });
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(container);
    resizeObserver.observe(root);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", measure, { passive: true });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    measure();

    const render = (time: number) => {
      const activelyScrolling = time - lastScrollAt < 180;
      const interval = activelyScrolling ? 1000 / 60 : 1000 / 30;
      if (!document.hidden && time - lastRenderAt >= interval) {
        lastRenderAt = time;
        program.uniforms.uTime.value = time * 0.001;
        program.uniforms.uWorld.value = [window.scrollY, rootTop, rootHeight, window.innerHeight];
        renderer.render({ scene: mesh });
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
      if (gl.canvas.parentNode === container) container.removeChild(gl.canvas);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [amplitude, colors, glow, lightColors, speed, thickness]);

  return <div ref={containerRef} className={`strands-container ${className}`.trim()} aria-hidden="true" />;
}
