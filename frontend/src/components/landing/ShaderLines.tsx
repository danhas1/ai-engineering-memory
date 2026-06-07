import { useEffect, useRef } from 'react'
import * as THREE from 'three'

const VERTEX_SHADER = /* glsl */ `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

// Soft blue-violet animated light streaks.
// No pixelation, no mosaic — pure smooth gaussian glow on dark background.
const FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform vec2  resolution;
uniform float time;
uniform float uLogicalWidth;

varying vec2 vUv;

float hash(float n) { return fract(sin(n) * 43758.5453); }

// Closest distance from p to segment (a, b) — aspect-space coords
float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h  = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  float asp = resolution.x / resolution.y;
  vec2  uv  = vec2(vUv.x * asp, vUv.y); // aspect-correct space

  vec3 col = vec3(0.0);

  // 10 independent light streaks
  for (int i = 0; i < 10; i++) {
    float fi = float(i);

    // Stable per-streak seeds
    float s0 = hash(fi * 1.61803 + 0.10);
    float s1 = hash(fi * 2.71828 + 0.43);
    float s2 = hash(fi * 3.14159 + 0.97);
    float s3 = hash(fi * 4.66920 + 1.62);
    float s4 = hash(fi * 6.62607 + 2.30);
    float s5 = hash(fi * 9.10938 + 3.14);

    // Very slow horizontal drift — speed varies per streak
    float spd = 0.016 + s1 * 0.020;
    float t   = fract(time * spd + s2 * 100.0);

    // Fade near the wrap point (t ≈ 0 and t ≈ 1) so the jump is invisible
    float wrapFade = smoothstep(0.0, 0.12, t) * smoothstep(1.0, 0.88, t);

    // Shallow angle: ±15 degrees from horizontal
    float ang = (s0 - 0.5) * 0.52;
    vec2  dir = normalize(vec2(cos(ang), sin(ang)));

    // Each streak occupies a fixed vertical band; X position advances with t
    float rowY  = mix(0.08, 0.92, s3);       // vertical position (UV space)
    float startX = t * (asp + 0.4) - 0.2;   // travels left → right across aspect space

    vec2 p0 = vec2(startX,        rowY) - dir * 0.55;
    vec2 p1 = vec2(startX,        rowY) + dir * 0.55;

    float d = segDist(uv, p0, p1);

    // Soft gaussian glow + thin bright core
    float glow = exp(-d * d * 1800.0);        // wide soft halo
    float core = exp(-d * d * 28000.0);       // sharp bright centre

    // Pulse: gentle brightness oscillation, unique phase per streak
    float pulse = 0.78 + 0.22 * sin(time * 0.7 + s5 * 6.2832);
    float level = (0.32 + s4 * 0.36) * pulse * wrapFade;

    // Blue-to-violet palette — no cyan, no warm tones
    vec3 streakCol;
    if      (s0 < 0.25) streakCol = vec3(0.18, 0.42, 0.98);  // cobalt blue
    else if (s0 < 0.50) streakCol = vec3(0.40, 0.22, 0.92);  // indigo-violet
    else if (s0 < 0.75) streakCol = vec3(0.55, 0.28, 1.00);  // soft violet
    else                streakCol = vec3(0.28, 0.50, 1.00);  // sky-blue

    col += streakCol      * glow * level * 0.65;
    col += vec3(0.88, 0.92, 1.00) * core * level * 1.10;
  }

  // Horizontal vignette — full intensity in the centre ~1000 px, fades at edges
  float frac    = clamp(1000.0 / max(uLogicalWidth, 1.0), 0.0, 1.0);
  float sideGap = max((1.0 - frac) * 0.5, 0.0001);
  float hFade   = smoothstep(0.0, sideGap, vUv.x)
                * smoothstep(0.0, sideGap, 1.0 - vUv.x);

  // Bottom fade — dissolves to black before the document-cards section
  float vFade = smoothstep(0.0, 0.26, vUv.y);

  col *= hFade * vFade;

  gl_FragColor = vec4(col, 1.0);
}
`

export function ShaderLines() {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = mountRef.current
    if (!el) return

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 1)
    el.appendChild(renderer.domElement)

    const scene  = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    const geometry = new THREE.PlaneGeometry(2, 2)
    const uniforms = {
      resolution:    { value: new THREE.Vector2() },
      time:          { value: 0 },
      uLogicalWidth: { value: 0 },
    }

    const material = new THREE.RawShaderMaterial({
      vertexShader:   VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms,
    })
    scene.add(new THREE.Mesh(geometry, material))

    const onResize = () => {
      const w   = el.clientWidth
      const h   = el.clientHeight
      const dpr = renderer.getPixelRatio()
      renderer.setSize(w, h)
      uniforms.resolution.value.set(w * dpr, h * dpr)
      uniforms.uLogicalWidth.value = w
    }
    onResize()

    const ro = new ResizeObserver(onResize)
    ro.observe(el)

    let raf = 0
    const clock = new THREE.Clock()
    const tick = () => {
      raf = requestAnimationFrame(tick)
      uniforms.time.value = clock.getElapsedTime()
      renderer.render(scene, camera)
    }
    tick()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.dispose()
      material.dispose()
      geometry.dispose()
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div
      ref={mountRef}
      className="absolute inset-0 pointer-events-none"
      aria-hidden
      style={{ zIndex: 0 }}
    />
  )
}
