"use client";

import { useEffect, useRef } from "react";
import createGlobe from "cobe";

const HUB = { name: "Buenos Aires", lat: -34.61, lon: -58.37, align: "bottom" };

const DESTINATIONS = [
  { name: "Santos",      lat: -23.96, lon: -46.30,  arcAlt: 0.22, align: "right"  },
  { name: "Shanghái",   lat:  31.23, lon: 121.47,  arcAlt: 0.44, align: "top"    },
  { name: "Miami",      lat:  25.76, lon: -80.19,  arcAlt: 0.28, align: "left"   },
  { name: "Hamburgo",   lat:  53.55, lon:   9.99,  arcAlt: 0.36, align: "top"    },
  { name: "Asunción",   lat: -25.29, lon: -57.65,  arcAlt: 0.20, align: "left"   },
  { name: "Hong Kong",  lat:  22.32, lon: 114.17,  arcAlt: 0.42, align: "bottom" },
  { name: "Singapur",   lat:   1.35, lon: 103.82,  arcAlt: 0.42, align: "right"  },
  { name: "Nueva York", lat:  40.71, lon: -74.01,  arcAlt: 0.32, align: "right"  },
  { name: "Rotterdam",  lat:  51.93, lon:   4.42,  arcAlt: 0.36, align: "bottom" },
  { name: "Dubai",      lat:  25.20, lon:  55.27,  arcAlt: 0.40, align: "right"  },
  { name: "Ningbo",     lat:  29.87, lon: 121.55,  arcAlt: 0.44, align: "bottom" },
  { name: "Panamá",     lat:   8.99, lon: -79.52,  arcAlt: 0.26, align: "bottom" },
];

const ALL_CITIES = [HUB, ...DESTINATIONS];

const SVG_COLORS = [
  "#ea580c", "#f97316", "#0ea5e9",
  "#3b82f6", "#94a3b8", "#f59e0b",
];

const F_DRAW  = 45;
const F_HOLD  = 80;
const F_FADE  = 40;
const F_PAUSE = 100;
const F_CYCLE = F_DRAW + F_HOLD + F_FADE + F_PAUSE;
const N       = DESTINATIONS.length;
const STAGGER = Math.floor(F_CYCLE / N);

function toSphere(lat: number, lng: number) {
  const pm = ((90 - lat) * Math.PI) / 180;
  const tm = ((lng + 180) * Math.PI) / 180;
  return {
    x: -(Math.sin(pm) * Math.cos(tm)),
    y:   Math.cos(pm),
    z:   Math.sin(pm) * Math.sin(tm),
  };
}

function project(lat: number, lng: number, phi: number, theta: number) {
  const { x, y, z } = toSphere(lat, lng);
  const cp = Math.cos(phi),  sp = Math.sin(phi);
  const ct = Math.cos(theta), st = Math.sin(theta);
  const rx   =  x * cp + z * sp;
  const temp = -(x * sp - z * cp);
  const ry   =  y * ct - temp * st;
  const rz   =  y * st + temp * ct;
  const S    = 620 * 0.435;
  return { x: 310 + rx * S, y: 310 - ry * S, depth: rz };
}

function svgArcPath(ax: number, ay: number, bx: number, by: number, arcAlt: number) {
  const lift = arcAlt * 620 * 0.7;
  const mx   = (ax + bx) / 2;
  const my   = (ay + by) / 2;
  const dx   = bx - ax, dy = by - ay;
  const len  = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx   = -dy / len;
  const ny   =  dx / len;
  return `M ${ax} ${ay} Q ${mx + nx * lift} ${my + ny * lift} ${bx} ${by}`;
}

export default function GlobeHero() {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const svgRef      = useRef<SVGSVGElement>(null);
  const pointersRef = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!canvasRef.current || !svgRef.current) return;
    const canvas = canvasRef.current;
    const svg    = svgRef.current;

    let phi         = 0.15;
    let theta       = 0.3;
    let isDrag      = false;
    let prevX = 0, prevY = 0;
    let velX  = 0, velY  = 0;
    let globalFrame = 0;
    let reqId: number;
    const t0 = Date.now();

    const gEls: SVGGElement[]        = [];
    const glowEls: SVGPathElement[]  = [];
    const lineEls: SVGPathElement[]  = [];
    const dotEls: SVGCircleElement[] = [];

    svg.innerHTML = `
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>`;

    DESTINATIONS.forEach((dest, i) => {
      const color = SVG_COLORS[i % SVG_COLORS.length];
      const g    = document.createElementNS("http://www.w3.org/2000/svg", "g");
      const glow = document.createElementNS("http://www.w3.org/2000/svg", "path");
      glow.setAttribute("stroke", color);
      glow.setAttribute("stroke-width", "4");
      glow.setAttribute("fill", "none");
      glow.setAttribute("filter", "url(#glow)");
      const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
      line.setAttribute("stroke", color);
      line.setAttribute("stroke-width", "1.5");
      line.setAttribute("fill", "none");
      line.setAttribute("stroke-linecap", "round");
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("r", "2.5");
      dot.setAttribute("fill", color);
      g.append(glow, line, dot);
      svg.appendChild(g);
      gEls.push(g); glowEls.push(glow); lineEls.push(line); dotEls.push(dot);
    });

    const DPR = Math.min(devicePixelRatio, 2);
    const globe = createGlobe(canvas, {
      devicePixelRatio: DPR,
      width:  canvas.offsetWidth  * DPR,
      height: canvas.offsetHeight * DPR,
      phi, theta,
      dark: 0, diffuse: 2.5, mapSamples: 25000, mapBrightness: 2,
      baseColor:   [0.98, 0.98, 0.98],
      markerColor: [0.92, 0.35, 0.05],
      glowColor:   [0.9,  0.9,  0.92],
      markers: ALL_CITIES.map((c) => ({
        location: [c.lat, c.lon] as [number, number],
        size: c.name === "Buenos Aires" ? 0.06 : 0.04,
      })),
    });

    const resizeObserver = new ResizeObserver(() => {
      globe.update({ width: canvas.offsetWidth * DPR, height: canvas.offsetHeight * DPR });
    });
    resizeObserver.observe(canvas);

    const onDragStart = (e: MouseEvent | TouchEvent) => {
      isDrag = true;
      const t = "touches" in e ? e.touches[0] : (e as MouseEvent);
      prevX = t.clientX; prevY = t.clientY; velX = 0; velY = 0;
    };
    const onDragMove = (e: MouseEvent | TouchEvent) => {
      if (!isDrag) return;
      const t = "touches" in e ? e.touches[0] : (e as MouseEvent);
      velX = (t.clientX - prevX) * 0.005;
      velY = (t.clientY - prevY) * 0.005;
      phi   += velX;
      theta  = Math.max(-0.55, Math.min(0.55, theta + velY));
      prevX  = t.clientX; prevY = t.clientY;
    };
    const onDragEnd = () => { isDrag = false; };

    canvas.addEventListener("mousedown",  onDragStart);
    window.addEventListener("mousemove",  onDragMove);
    window.addEventListener("mouseup",    onDragEnd);
    canvas.addEventListener("touchstart", onDragStart, { passive: true });
    window.addEventListener("touchmove",  onDragMove,  { passive: true });
    window.addEventListener("touchend",   onDragEnd);

    function frame() {
      globalFrame++;
      const dt = Date.now() - t0;

      if (!isDrag) {
        phi   += Math.sin(dt / 3500) * 0.003;
        theta  = 0.28 + Math.sin(dt / 5500) * 0.16;
      } else {
        phi   += velX;
        theta  = Math.max(-0.55, Math.min(0.55, theta + velY));
        velX  *= 0.9; velY *= 0.9;
      }

      globe.update({ phi, theta });

      ALL_CITIES.forEach((city, i) => {
        const el = pointersRef.current[city.name];
        if (!el) return;
        const pos = project(city.lat, city.lon, phi, theta);
        if (pos.depth < 0.06) { el.style.opacity = "0"; return; }
        let trans = "translate(10px, -50%)";
        if (city.align === "left")   trans = "translate(calc(-100% - 10px), -50%)";
        if (city.align === "bottom") trans = "translate(-50%, 10px)";
        if (city.align === "top")    trans = "translate(-50%, calc(-100% - 10px))";
        if (city.name === "Buenos Aires") trans = "translate(-50%, 15px)";
        el.style.transform = trans;
        el.style.left      = ((pos.x / 620) * 100).toFixed(3) + "%";
        el.style.top       = ((pos.y / 620) * 100).toFixed(3) + "%";
        el.style.opacity   = i === 0 ? "1" : String(Math.min(1, 0.4 + pos.depth * 0.65));
        el.style.zIndex    = String(10 + Math.floor(pos.depth * 50));
      });

      const hubPos = project(HUB.lat, HUB.lon, phi, theta);
      DESTINATIONS.forEach((dest, index) => {
        const g    = gEls[index];
        const glow = glowEls[index];
        const line = lineEls[index];
        const dot  = dotEls[index];
        const posState = (globalFrame + index * STAGGER) % F_CYCLE;
        let opacity = 0;
        if (posState < F_DRAW)                         opacity = posState / F_DRAW;
        else if (posState < F_DRAW + F_HOLD)           opacity = 1;
        else if (posState < F_DRAW + F_HOLD + F_FADE)  opacity = 1 - (posState - F_DRAW - F_HOLD) / F_FADE;
        if (opacity < 0.04) { g.style.display = "none"; return; }
        const destPos = project(dest.lat, dest.lon, phi, theta);
        if (hubPos.depth < 0.04 && destPos.depth < 0.04) { g.style.display = "none"; return; }
        if (destPos.depth < 0.04) {
          dot.setAttribute("display", "none");
        } else {
          dot.setAttribute("display", "inline");
          dot.setAttribute("cx", String(destPos.x));
          dot.setAttribute("cy", String(destPos.y));
        }
        const depthModifier = hubPos.depth < 0.04 || destPos.depth < 0.04 ? 0.3 : 1;
        const finalOpacity  = opacity * depthModifier;
        g.style.display = "contents";
        glow.setAttribute("stroke-opacity", String(finalOpacity * 0.15));
        line.setAttribute("stroke-opacity", String(finalOpacity * 0.7));
        dot.setAttribute("opacity", String(finalOpacity));
        const d = svgArcPath(hubPos.x, hubPos.y, destPos.x, destPos.y, dest.arcAlt);
        glow.setAttribute("d", d);
        line.setAttribute("d", d);
      });

      reqId = requestAnimationFrame(frame);
    }
    reqId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(reqId);
      globe.destroy();
      resizeObserver.disconnect();
      canvas.removeEventListener("mousedown",  onDragStart);
      window.removeEventListener("mousemove",  onDragMove);
      window.removeEventListener("mouseup",    onDragEnd);
      canvas.removeEventListener("touchstart", onDragStart);
      window.removeEventListener("touchmove",  onDragMove);
      window.removeEventListener("touchend",   onDragEnd);
    };
  }, []);

  return (
    <>
    <div className="relative w-full aspect-square flex items-center justify-center" style={{ overflow: "visible" }}>
      <div className="relative w-[90%] h-[90%]" style={{ animation: "globeFadeIn 0.8s cubic-bezier(.2,0,.2,1) both", overflow: "visible" }}>
        <canvas
          ref={canvasRef}
          className="relative z-10 w-full h-full cursor-grab active:cursor-grabbing rounded-full"
        />
        <svg
          ref={svgRef}
          viewBox="0 0 620 620"
          className="absolute inset-0 z-[12] pointer-events-none w-full h-full"
          style={{ overflow: "visible" }}
        />
        {ALL_CITIES.map((city) => (
          <div
            key={city.name}
            ref={(el) => { if (el) pointersRef.current[city.name] = el; }}
            className={`absolute z-[20] pointer-events-none tracking-wide uppercase transition-opacity duration-300 will-change-transform ${
              city.name === "Buenos Aires"
                ? "text-[12px] font-bold text-slate-900"
                : "text-[11px] font-semibold text-slate-800"
            }`}
            style={{
              textShadow: "-2px -2px 0 #f4f5f6, 2px -2px 0 #f4f5f6, -2px 2px 0 #f4f5f6, 2px 2px 0 #f4f5f6, 0 4px 6px rgba(0,0,0,0.05)",
            }}
          >
            {city.name}
          </div>
        ))}
      </div>
    </div>
    <style dangerouslySetInnerHTML={{ __html: `
      @keyframes globeFadeIn {
        from { opacity: 0; transform: scale(0.94); }
        to   { opacity: 1; transform: scale(1); }
      }
    `}} />
    </>
  );
}
