import { useEffect, useRef, useState } from 'react';
import earcut from 'earcut';
import { Hand, Maximize2, Move, RotateCcw, Home, ZoomIn, ZoomOut, Target, Ruler, ChevronRight } from 'lucide-react';
import type { DoorConfig } from '../lib/door-model';
import { deriveDoor, jointClearanceReport } from '../lib/door-model';
import { loadDxfProfile } from '../lib/dxf-profile';

interface DoorViewerProps {
  config: DoorConfig;
  view: 'assembly' | 'exploded' | 'section';
  setView?: (v: 'assembly' | 'exploded' | 'section') => void;
  theme?: 'dark' | 'light';
}

interface ViewerController {
  setThemeColor: (th: 'dark' | 'light') => void;
  setNav: (mode: 'orbit' | 'pan') => void;
  fit: (w: number, h: number) => void;
  reset: (h: number) => void;
  preset: (id: 'front' | 'side' | 'top' | '3d' | 'section' | 'detail', w: number, h: number) => void;
  rebuild: (cfg: DoorConfig, v: 'assembly' | 'exploded' | 'section', th: 'dark' | 'light') => void;
  destroy: () => void;
}

export default function DoorViewer({ config, view, setView, theme = 'dark' }: DoorViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [navMode, setNavMode] = useState<'orbit' | 'pan'>('orbit');
  const [activePresetView, setActivePresetView] = useState<'front' | 'side' | 'top' | '3d' | 'section' | 'detail'>('front');
  const controllerRef = useRef<ViewerController | null>(null);

  // Initialize Babylon.js Scene and Controller
  useEffect(() => {
    let cancelled = false;
    let engine: import('@babylonjs/core').Engine | undefined;

    const setup = async () => {
      const B = await import('@babylonjs/core');
      if (cancelled || !canvasRef.current) return;

      engine = new B.Engine(canvasRef.current, true, { preserveDrawingBuffer: true, stencil: true });
      const scene = new B.Scene(engine);
      scene.clearColor = new B.Color4(0.96, 0.97, 0.99, 1);

      const camera = new B.ArcRotateCamera('camera', -Math.PI / 2.25, Math.PI / 2.25, 3000, new B.Vector3(450, 1050, 0), scene);
      camera.lowerRadiusLimit = 150;
      camera.upperRadiusLimit = 7500;
      camera.wheelDeltaPercentage = 0.05;
      camera.panningSensibility = 50;
      camera.panningAxis = new B.Vector3(1, 1, 0);
      camera.attachControl(canvasRef.current, true);

      const ambientLight = new B.HemisphericLight('ambient', new B.Vector3(-0.3, 1, -0.5), scene);
      ambientLight.intensity = 1.45;

      const key = new B.DirectionalLight('key', new B.Vector3(-0.4, -1, 0.6), scene);
      key.intensity = 1.35;

      const ground = B.MeshBuilder.CreateGround('ground', { width: 4800, height: 3200 }, scene);
      ground.position.set(450, -35, 180);
      const groundMat = new B.StandardMaterial('ground-mat', scene);
      groundMat.diffuseColor = new B.Color3(0.92, 0.94, 0.96);
      groundMat.specularColor = new B.Color3(0.08, 0.08, 0.08);
      ground.material = groundMat;

      const resize = () => engine?.resize();
      window.addEventListener('resize', resize);

      let currentRoot: import('@babylonjs/core').TransformNode | null = null;

      const setThemeColor = (th: 'dark' | 'light') => {
        if (th === 'light') {
          scene.clearColor = new B.Color4(0.96, 0.97, 0.99, 1);
          groundMat.diffuseColor = new B.Color3(0.92, 0.94, 0.96);
          ambientLight.intensity = 1.45;
          key.intensity = 1.35;
        } else {
          scene.clearColor = new B.Color4(0.035, 0.052, 0.063, 1);
          groundMat.diffuseColor = new B.Color3(0.055, 0.072, 0.082);
          ambientLight.intensity = 1.05;
          key.intensity = 1.25;
        }
      };

      const setNav = (mode: 'orbit' | 'pan') => {
        const pointers = (camera.inputs.attached as { pointers?: { buttons?: number[] } }).pointers;
        if (pointers) {
          pointers.buttons = mode === 'pan' ? [1, 2, 0] : [0, 1, 2];
        }
      };

      const fit = (w: number, h: number) => {
        camera.setTarget(new B.Vector3(w / 2, h / 2, 0));
        camera.radius = Math.max(h * 1.32, 2400);
        camera.alpha = -Math.PI / 2.25;
        camera.beta = Math.PI / 2.25;
      };

      const reset = (h: number) => {
        camera.alpha = -Math.PI / 2.25;
        camera.beta = Math.PI / 2.25;
        camera.radius = Math.max(h * 1.32, 2400);
      };

      const preset = (id: 'front' | 'side' | 'top' | '3d' | 'section' | 'detail', w: number, h: number) => {
        const cx = w / 2;
        const cy = h / 2;
        const baseR = Math.max(h * 1.32, 2400);
        let a = camera.alpha;
        let b = camera.beta;
        let r = camera.radius;
        const look = new B.Vector3(cx, cy, -90);
        switch (id) {
          case 'front':
            a = 0;
            b = Math.PI / 2;
            r = baseR;
            break;
          case 'side':
            a = Math.PI / 2;
            b = Math.PI / 2;
            r = baseR;
            break;
          case 'top':
            a = 0;
            b = 0.06;
            r = baseR;
            break;
          case '3d':
            a = -Math.PI / 2.25;
            b = Math.PI / 2.25;
            r = baseR;
            break;
          case 'section':
            a = -0.66;
            b = 1.25;
            r = Math.max(h * 0.52, 820);
            look.set(cx * 0.55, cy, -90);
            break;
          case 'detail':
            a = -Math.PI / 2.25;
            b = Math.PI / 2.25;
            r = Math.max(h * 0.34, 560);
            look.set(cx + w * 0.24, cy + h * 0.05, -90);
            break;
        }
        camera.alpha = a;
        camera.beta = b;
        camera.radius = r;
        camera.setTarget(look);
      };

      const rebuild = async (cfg: DoorConfig, v: 'assembly' | 'exploded' | 'section', th: 'dark' | 'light') => {
        if (currentRoot) {
          currentRoot.dispose(false, true);
          currentRoot = null;
        }

        const root = new B.TransformNode('door-assembly', scene);
        currentRoot = root;
        const d = deriveDoor(cfg);
        const explode = v === 'exploded' ? 145 : v === 'section' ? 55 : 0;

        const finishColors = {
          natural: new B.Color3(0.64, 0.68, 0.70),
          black: new B.Color3(0.055, 0.065, 0.07),
          bronze: new B.Color3(0.28, 0.20, 0.13),
          white: new B.Color3(0.92, 0.93, 0.94),
        };

        const finishKey = (cfg.finish || 'natural') as keyof typeof finishColors;
        const finishColor = finishColors[finishKey] || finishColors.natural;

        const aluminium = new B.PBRMaterial('powder-coated-aluminium', scene);
        aluminium.albedoColor = finishColor;
        aluminium.emissiveColor = finishColor.scale(th === 'light' ? 0.08 : 0.16);
        aluminium.metallic = 0.72;
        aluminium.roughness = 0.3;

        const edge = new B.PBRMaterial('machined-ends', scene);
        edge.albedoColor = new B.Color3(0.34, 0.37, 0.39);
        edge.metallic = 0.8;
        edge.roughness = 0.22;

        const glass = new B.PBRMaterial('glass-mat', scene);
        glass.albedoColor = new B.Color3(0.12, 0.42, 0.50);
        glass.alpha = 0.32;
        glass.metallic = 0.04;
        glass.roughness = 0.12;
        glass.indexOfRefraction = 1.52;
        glass.backFaceCulling = false;

        const dark = new B.PBRMaterial('hardware', scene);
        dark.albedoColor = new B.Color3(0.06, 0.07, 0.075);
        dark.metallic = 0.86;
        dark.roughness = 0.23;

        const brass = new B.PBRMaterial('screw-heads', scene);
        brass.albedoColor = new B.Color3(0.61, 0.46, 0.22);

        const profileIds = [
          '100D-3105',
          '100D-101',
          '100D-102',
          '100D-103',
          '100D-201',
          '100D-301',
          '100D-401',
          '100D-501',
          '70S-1001-1',
          '70S-1101-1',
          '70S-1201-1',
          '70S-1401',
          '70S-1501',
          '70S-1601',
          '70S-1701',
        ] as const;

        const loaded = await Promise.all(profileIds.map((id) => loadDxfProfile(id).catch(() => null)));
        const profiles = new Map(loaded.filter(Boolean).map((p) => [p!.id, p!]));

        type Axis = 'vertical' | 'leaf-vertical' | 'rail-horizontal' | 'frame-horizontal';
        type Miter = 'none' | 'left-jamb' | 'right-jamb' | 'head';

        const exactProfile = (
          name: string,
          id: typeof profileIds[number],
          length: number,
          axis: Axis,
          origin: { x: number; y: number; z: number },
          parent: import('@babylonjs/core').TransformNode,
          mirrorFace = false,
          miter: Miter = 'none',
          flipCross = false
        ) => {
          const profile = profiles.get(id);
          if (!profile) return null;
          const vector = (point: { x: number; y: number }) => new B.Vector2(point.x - profile.minX, point.y - profile.minY);
          const builder = new B.PolygonMeshBuilder(name, profile.outer.points.map(vector), scene, earcut);
          profile.holes.forEach((hole) => builder.addHole(hole.points.map(vector)));
          const mesh = builder.build(false, length);
          const positions = mesh.getVerticesData(B.VertexBuffer.PositionKind);
          const indices = mesh.getIndices();
          if (!positions || !indices) return mesh;

          for (let i = 0; i < positions.length; i += 3) {
            const crossX = positions[i];
            const long = -positions[i + 1];
            const crossY = positions[i + 2];
            const face = mirrorFace ? profile.height - crossY : crossY;

            if (axis === 'vertical') {
              positions[i] = origin.x + face;
              positions[i + 1] = origin.y + long;
              positions[i + 2] = origin.z + crossX - profile.width / 2;
              if (long > length - 1e-4) {
                if (miter === 'left-jamb') positions[i + 1] -= face;
                else if (miter === 'right-jamb') positions[i + 1] -= profile.height - face;
              }
            } else if (axis === 'leaf-vertical') {
              const leafFace = mirrorFace ? profile.width - crossX : crossX;
              positions[i] = origin.x + leafFace;
              positions[i + 1] = origin.y + long;
              positions[i + 2] = origin.z + crossY - profile.height / 2;
            } else if (axis === 'frame-horizontal') {
              positions[i] = origin.x + long;
              positions[i + 1] = origin.y + face;
              positions[i + 2] = origin.z + crossX - profile.width / 2;
              if (miter === 'head') {
                if (long < 1e-4) positions[i] += profile.height - face;
                else if (long > length - 1e-4) positions[i] -= profile.height - face;
              }
            } else {
              const railFace = flipCross ? profile.width - crossX : crossX;
              positions[i] = origin.x + long;
              positions[i + 1] = origin.y + railFace;
              positions[i + 2] = origin.z + crossY - profile.height / 2;
            }
          }

          const normals: number[] = [];
          B.VertexData.ComputeNormals(Array.from(positions), Array.from(indices), normals);
          mesh.setVerticesData(B.VertexBuffer.PositionKind, positions);
          mesh.setVerticesData(B.VertexBuffer.NormalKind, normals);
          mesh.material = aluminium;
          mesh.parent = parent;
          mesh.metadata = { profileId: id, source: 'exact-dxf', hollowChambers: profile.holes.length };
          return mesh;
        };

        const box = (
          name: string,
          bw: number,
          bh: number,
          depth: number,
          x: number,
          y: number,
          z: number,
          mat = aluminium
        ) => {
          const mesh = B.MeshBuilder.CreateBox(name, { width: bw, height: bh, depth }, scene);
          mesh.position.set(x, y, z);
          mesh.material = mat;
          mesh.metadata = { source: 'box-fallback' };
          return mesh;
        };

        const system = cfg.system || '100D-single';
        const frameSpread = v === 'exploded' ? 85 : 0;

        if (system === '70S-sliding-2p' || system === '70S-sliding-4p') {
          // 70S Frame Head (70S-1001-1)
          const fHead = exactProfile('70S-head-1001', '70S-1001-1', cfg.width, 'frame-horizontal', { x: 0, y: cfg.height - 32, z: 0 }, root);
          if (!fHead) box('70S-head-fallback', cfg.width, 32, 70, cfg.width / 2, cfg.height - 16 + frameSpread, 0, aluminium);
          else if (frameSpread) fHead.position.y += frameSpread;

          // 70S Frame Sill (70S-1101-1)
          const fSill = exactProfile('70S-sill-1101', '70S-1101-1', cfg.width, 'frame-horizontal', { x: 0, y: 0, z: 0 }, root);
          if (!fSill) box('70S-sill-fallback', cfg.width, 30, 70, cfg.width / 2, 15 - frameSpread, 0, aluminium);
          else if (frameSpread) fSill.position.y -= frameSpread;

          // 70S Left Jamb (70S-1201-1)
          const fJambL = exactProfile('70S-jamb-left-1201', '70S-1201-1', cfg.height, 'vertical', { x: 0, y: 0, z: 0 }, root);
          if (!fJambL) box('70S-jamb-l-fallback', 25, cfg.height, 70, 12.5 - frameSpread, cfg.height / 2, 0, aluminium);
          else if (frameSpread) fJambL.position.x -= frameSpread;

          // 70S Right Jamb (70S-1201-1 mirrored)
          const fJambR = exactProfile('70S-jamb-right-1201', '70S-1201-1', cfg.height, 'vertical', { x: cfg.width - 25, y: 0, z: 0 }, root, true);
          if (!fJambR) box('70S-jamb-r-fallback', 25, cfg.height, 70, cfg.width - 12.5 + frameSpread, cfg.height / 2, 0, aluminium);
          else if (frameSpread) fJambR.position.x += frameSpread;

          // Sashes
          const panelW = (cfg.width + 28) / 2;
          const panelH = cfg.height - 28;
          const railLen = panelW - 56;

          // Panel 1 (Front track, Z = +16mm)
          const p1Root = new B.TransformNode('panel-1', scene);
          p1Root.parent = root;
          p1Root.position.set(25, 14, 16);

          const p1Top = exactProfile('p1-top-rail', '70S-1401', railLen, 'rail-horizontal', { x: 28, y: panelH - 32, z: 0 }, p1Root);
          if (!p1Top) box('p1-top-fallback', railLen, 32, 28, panelW / 2, panelH - 16, 0, aluminium).parent = p1Root;

          const p1Bot = exactProfile('p1-bot-rail', '70S-1501', railLen, 'rail-horizontal', { x: 28, y: 0, z: 0 }, p1Root);
          if (!p1Bot) box('p1-bot-fallback', railLen, 56, 28, panelW / 2, 28, 0, aluminium).parent = p1Root;

          const p1Stile = exactProfile('p1-lock-stile', '70S-1701', panelH, 'leaf-vertical', { x: 0, y: 0, z: 0 }, p1Root);
          if (!p1Stile) box('p1-stile-fallback', 28, panelH, 28, 14, panelH / 2, 0, aluminium).parent = p1Root;

          const p1Interlock = exactProfile('p1-interlock', '70S-1601', panelH, 'leaf-vertical', { x: panelW - 28, y: 0, z: 0 }, p1Root);
          if (!p1Interlock) box('p1-interlock-fallback', 28, panelH, 28, panelW - 14, panelH / 2, 0, aluminium).parent = p1Root;

          // Rollers in Panel 1
          [60, panelW - 60].forEach((rx, ri) => {
            const wheel = B.MeshBuilder.CreateCylinder(`p1-wheel-${ri}`, { height: 16, diameter: 28, tessellation: 24 }, scene);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(rx, 14, 0);
            wheel.material = brass;
            wheel.parent = p1Root;
          });

          if (cfg.showGlass) {
            const g1 = box('p1-glass', panelW - 56, panelH - 80, 6, panelW / 2, panelH / 2 + 6, 0, glass);
            g1.parent = p1Root;
            g1.visibility = 0.32;
          }

          // Panel 2 (Rear track, Z = -16mm)
          const p2Root = new B.TransformNode('panel-2', scene);
          p2Root.parent = root;
          p2Root.position.set(cfg.width - 25 - panelW, 14, -16);

          const p2Top = exactProfile('p2-top-rail', '70S-1401', railLen, 'rail-horizontal', { x: 28, y: panelH - 32, z: 0 }, p2Root);
          if (!p2Top) box('p2-top-fallback', railLen, 32, 28, panelW / 2, panelH - 16, 0, aluminium).parent = p2Root;

          const p2Bot = exactProfile('p2-bot-rail', '70S-1501', railLen, 'rail-horizontal', { x: 28, y: 0, z: 0 }, p2Root);
          if (!p2Bot) box('p2-bot-fallback', railLen, 56, 28, panelW / 2, 28, 0, aluminium).parent = p2Root;

          const p2Interlock = exactProfile('p2-interlock', '70S-1601', panelH, 'leaf-vertical', { x: 0, y: 0, z: 0 }, p2Root, true);
          if (!p2Interlock) box('p2-interlock-fallback', 28, panelH, 28, 14, panelH / 2, 0, aluminium).parent = p2Root;

          const p2Stile = exactProfile('p2-lock-stile', '70S-1701', panelH, 'leaf-vertical', { x: panelW - 28, y: 0, z: 0 }, p2Root, true);
          if (!p2Stile) box('p2-stile-fallback', 28, panelH, 28, panelW - 14, panelH / 2, 0, aluminium).parent = p2Root;

          // Rollers in Panel 2
          [60, panelW - 60].forEach((rx, ri) => {
            const wheel = B.MeshBuilder.CreateCylinder(`p2-wheel-${ri}`, { height: 16, diameter: 28, tessellation: 24 }, scene);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(rx, 14, 0);
            wheel.material = brass;
            wheel.parent = p2Root;
          });

          if (cfg.showGlass) {
            const g2 = box('p2-glass', panelW - 56, panelH - 80, 6, panelW / 2, panelH / 2 + 6, 0, glass);
            g2.parent = p2Root;
            g2.visibility = 0.32;
          }
        } else {
          const frameLeft = exactProfile('frame-left-100D-3105', '100D-3105', cfg.height, 'vertical', { x: 0, y: 0, z: 0 }, root, false, 'left-jamb');
          if (!frameLeft) box('frame-left-fallback', d.frameFace, cfg.height, 100, d.frameFace / 2 - frameSpread, cfg.height / 2, 0, aluminium);
          else if (frameSpread) frameLeft.position.x = -frameSpread;

          const frameRight = exactProfile('frame-right-100D-3105', '100D-3105', cfg.height, 'vertical', { x: cfg.width - d.frameFace, y: 0, z: 0 }, root, true, 'right-jamb');
          if (!frameRight) box('frame-right-fallback', d.frameFace, cfg.height, 100, cfg.width - d.frameFace / 2 + frameSpread, cfg.height / 2, 0, aluminium);
          else if (frameSpread) frameRight.position.x = frameSpread;

          const frameHead = exactProfile('frame-head-100D-3105', '100D-3105', cfg.width, 'frame-horizontal', { x: 0, y: cfg.height - d.frameFace, z: 0 }, root, false, 'head');
          if (!frameHead) box('frame-head-fallback', cfg.width, d.frameFace, 100, cfg.width / 2, cfg.height - d.frameFace / 2 + frameSpread, 0, aluminium);
          else if (frameSpread) frameHead.position.y = frameSpread;

          const hingeLeft = cfg.hingeSide === 'left';
          const hingeX = hingeLeft ? d.leafLeft : d.leafRight;
          const leafRoot = new B.TransformNode('operable-leaf', scene);
          leafRoot.parent = root;
          leafRoot.position.x = hingeX;
          leafRoot.rotation.y = (hingeLeft ? -1 : 1) * ((cfg.openingAngle || 8) * Math.PI) / 180;

          const memberBox = (name: string, bw: number, bh: number, depth: number, x: number, y: number, z: number, mat = aluminium) => {
            const m = box(name, bw, bh, depth, x - hingeX, y, z, mat);
            m.parent = leafRoot;
            return m;
          };

          const stileLength = d.leafTop - d.leafBottom;
          const railLength = d.clearWidth - d.jointGap * 2;
          const leftStileId = hingeLeft ? '100D-101' : '100D-103';
          const rightStileId = hingeLeft ? '100D-103' : '100D-101';

          const sLeft = exactProfile(`${hingeLeft ? 'hinge' : 'lock'}-stile-${leftStileId}`, leftStileId, stileLength, 'leaf-vertical', { x: d.leafLeft - hingeX - explode, y: d.leafBottom, z: 0 }, leafRoot, hingeLeft);
          if (!sLeft) memberBox('left-stile-fallback', d.leftStileFace, stileLength, 100, d.leafLeft + d.leftStileFace / 2 - explode, d.leafBottom + stileLength / 2, 0, aluminium);

          const sRight = exactProfile(`${hingeLeft ? 'lock' : 'hinge'}-stile-${rightStileId}`, rightStileId, stileLength, 'leaf-vertical', { x: d.leafRight - d.rightStileFace - hingeX + explode, y: d.leafBottom, z: 0 }, leafRoot, hingeLeft);
          if (!sRight) memberBox('right-stile-fallback', d.rightStileFace, stileLength, 100, d.leafRight - d.rightStileFace / 2 + explode, d.leafBottom + stileLength / 2, 0, aluminium);

          const rTop = exactProfile('top-rail-100D-201', '100D-201', railLength, 'rail-horizontal', { x: d.railLeft + d.jointGap - hingeX, y: d.leafTop - d.topRail, z: explode }, leafRoot);
          if (!rTop) memberBox('top-rail-fallback', railLength, d.topRail, 100, (d.railLeft + d.railRight) / 2, d.leafTop - d.topRail / 2, explode, aluminium);

          const rMid = exactProfile('mid-rail-100D-301', '100D-301', railLength, 'rail-horizontal', { x: d.railLeft + d.jointGap - hingeX, y: d.midCenter - d.midRail / 2, z: explode }, leafRoot);
          if (!rMid) memberBox('mid-rail-fallback', railLength, d.midRail, 100, (d.railLeft + d.railRight) / 2, d.midCenter, explode, aluminium);

          const rBot = exactProfile('bottom-rail-100D-401', '100D-401', railLength, 'rail-horizontal', { x: d.railLeft + d.jointGap - hingeX, y: d.leafBottom, z: explode }, leafRoot, false, 'none', true);
          if (!rBot) memberBox('bottom-rail-fallback', railLength, d.bottomRail, 100, (d.railLeft + d.railRight) / 2, d.leafBottom + d.bottomRail / 2, explode, aluminium);

          if (cfg.showGlass) {
            const glassW = d.glassX1 - d.glassX0;
            const g1 = memberBox('lower-glass-6mm', glassW, d.lowerGlassY1 - d.lowerGlassY0, 6, (d.glassX0 + d.glassX1) / 2, (d.lowerGlassY0 + d.lowerGlassY1) / 2, 0, glass);
            g1.visibility = 0.72;
            const g2 = memberBox('upper-glass-6mm', glassW, d.upperGlassY1 - d.upperGlassY0, 6, (d.glassX0 + d.glassX1) / 2, (d.upperGlassY0 + d.upperGlassY1) / 2, 0, glass);
            g2.visibility = 0.72;
          }

          // Joint hardware
          const jointHardware = (label: string, jointX: number, railY: number, railHeight: number, intoRail: 1 | -1) => {
            for (const vertical of [-1, 1] as const) {
              const y = railY + vertical * (railHeight / 2 - 13);
              memberBox(`${label}-angle-long-${vertical}`, 38, 3, 24, jointX + intoRail * 19, y, explode * 0.45, edge);
              memberBox(`${label}-angle-stile-${vertical}`, 3, 24, 24, jointX - intoRail * 1.5, y - vertical * 10, explode * 0.45, edge);
            }
            const rod = B.MeshBuilder.CreateCylinder(`${label}-threaded-tie-rod`, { height: 78, diameter: 5.5, tessellation: 16 }, scene);
            rod.rotation.z = Math.PI / 2;
            rod.position.set(jointX - hingeX + intoRail * 4, railY, explode * 0.45);
            rod.material = brass;
            rod.parent = leafRoot;
          };

          const railJoints: [string, number, number][] = [
            ['bottom', d.leafBottom + d.bottomRail / 2, d.bottomRail],
            ['mid', d.midCenter, d.midRail],
            ['top', d.leafTop - d.topRail / 2, d.topRail],
          ];
          railJoints.forEach(([label, y, height]) => {
            jointHardware(`${label}-left`, d.railLeft, y, height, 1);
            jointHardware(`${label}-right`, d.railRight, y, height, -1);
          });

          // Hinges
          const pinX = hingeLeft ? d.leafLeft - 2 : d.leafRight + 2;
          const hingeYs = [d.leafBottom + 280, (d.leafBottom + d.leafTop) / 2, d.leafTop - 280];
          hingeYs.forEach((hy, hi) => {
            const pin = B.MeshBuilder.CreateCylinder(`hinge-${hi}-barrel`, { height: 112, diameter: 13, tessellation: 28 }, scene);
            pin.position.set(pinX, hy, -38 - explode * 0.32);
            pin.material = dark;
            pin.parent = root;
            box(`hinge-${hi}-frame-leaf`, 26, 92, 3, pinX + (hingeLeft ? -14 : 14), hy, -37 - explode * 0.32, dark);
            memberBox(`hinge-${hi}-door-leaf`, 26, 92, 3, pinX + (hingeLeft ? 14 : -14), hy, -37 - explode * 0.32, dark);
          });

          // Handle
          const handleX = hingeLeft ? d.leafRight - 25 : d.leafLeft + 25;
          const grip = B.MeshBuilder.CreateCylinder('pull-handle', { height: 280, diameter: 18, tessellation: 30 }, scene);
          grip.position.set(handleX - hingeX, d.midCenter + 260, -72 - explode * 0.2);
          grip.material = dark;
          grip.parent = leafRoot;
        }

        // Edges & X-Ray 35% (Prominent Creality 3D CAD style wireframe outlines)
        root.getChildMeshes().forEach((m) => {
          m.enableEdgesRendering(0.93);
          m.edgesWidth = th === 'light' ? 1.4 : 0.8;
          m.edgesColor = th === 'light' ? new B.Color4(0.08, 0.12, 0.16, 0.95) : new B.Color4(0.04, 0.05, 0.055, 0.65);

          if (v === 'section') {
            const focus = m.name.includes('mid-rail') || m.name.includes('mid-left') || m.name.includes('hinge-stile');
            m.visibility = focus ? (m.name.includes('mid-left') ? 1 : 0.75) : 0.35;
          } else {
            m.visibility = m.name.includes('glass') ? 0.32 : 1;
          }
        });

        if (v === 'section') {
          if (system.startsWith('70S')) {
            camera.setTarget(new B.Vector3(cfg.width / 2, 80, 0));
            camera.radius = 450;
            camera.alpha = -Math.PI / 2.5;
            camera.beta = 1.25;
          } else {
            camera.setTarget(new B.Vector3(d.railLeft, d.midCenter, 0));
            camera.radius = 420;
            camera.alpha = -0.66;
            camera.beta = 1.22;
          }
        } else {
          camera.setTarget(new B.Vector3(cfg.width / 2, cfg.height / 2, 0));
          camera.radius = Math.max(cfg.height * 1.32, 2400);
        }

        const clearance = jointClearanceReport(cfg);
        if (canvasRef.current) {
          canvasRef.current.dataset.modelReady = 'true';
          canvasRef.current.dataset.meshCount = String(scene.meshes.length);
          canvasRef.current.dataset.railBodyOverlap = String(clearance.leftStileOverlap + clearance.rightStileOverlap);
        }
      };

      controllerRef.current = {
        setThemeColor,
        setNav,
        fit,
        reset,
        preset,
        rebuild,
        destroy: () => {
          window.removeEventListener('resize', resize);
          if (currentRoot) currentRoot.dispose(false, true);
          engine?.dispose();
        },
      };

      engine.runRenderLoop(() => scene.render());
    };

    void setup();

    return () => {
      cancelled = true;
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, []);

  // Sync theme
  useEffect(() => {
    controllerRef.current?.setThemeColor(theme);
  }, [theme]);

  // Sync navMode
  useEffect(() => {
    controllerRef.current?.setNav(navMode);
  }, [navMode]);

  // Sync 3D model when config, view or theme changes
  useEffect(() => {
    const ctrl = controllerRef.current;
    if (ctrl) {
      ctrl.rebuild(config, view, theme);
    }
  }, [config, view, theme]);

  const zoomToFit = () => {
    controllerRef.current?.fit(config.width, config.height);
  };

  const resetView = () => {
    controllerRef.current?.reset(config.height);
  };

  const goPreset = (id: 'front' | 'side' | 'top' | '3d' | 'section' | 'detail') => {
    setActivePresetView(id);
    controllerRef.current?.preset(id, config.width, config.height);
  };

  return (
    <div className="viewer-container" style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Top Floating Viewport Control Toolbar (single line) */}
      <div className="viewport-header-overlay" style={{ position: 'absolute', top: 12, left: 12, right: 12, zIndex: 10, display: 'flex', flexWrap: 'nowrap', overflowX: 'auto', alignItems: 'center', gap: 8, pointerEvents: 'none' }}>
        {/* Left View Mode Tabs */}
        <div className="mode-pill-group" style={{ pointerEvents: 'auto', display: 'flex', flexShrink: 0, whiteSpace: 'nowrap', background: 'rgba(255, 255, 255, 0.92)', backdropFilter: 'blur(8px)', padding: 3, borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' }}>
          <button
            className={`mode-pill ${view === 'assembly' ? 'active' : ''}`}
            onClick={() => setView?.('assembly')}
            style={{
              padding: '5px 12px',
              borderRadius: '7px',
              border: 'none',
              fontSize: '11.5px',
              fontWeight: 700,
              cursor: 'pointer',
              background: view === 'assembly' ? '#f59e0b' : 'transparent',
              color: view === 'assembly' ? '#241505' : '#64748b',
              transition: 'all 0.15s ease'
            }}
          >
            Assembly
          </button>
          <button
            className={`mode-pill ${view === 'exploded' ? 'active' : ''}`}
            onClick={() => setView?.('exploded')}
            style={{
              padding: '5px 12px',
              borderRadius: '7px',
              border: 'none',
              fontSize: '11.5px',
              fontWeight: 700,
              cursor: 'pointer',
              background: view === 'exploded' ? '#f59e0b' : 'transparent',
              color: view === 'exploded' ? '#241505' : '#64748b',
              transition: 'all 0.15s ease'
            }}
          >
            Exploded
          </button>
          <button
            className={`mode-pill ${view === 'section' ? 'active' : ''}`}
            onClick={() => setView?.('section')}
            style={{
              padding: '5px 12px',
              borderRadius: '7px',
              border: 'none',
              fontSize: '11.5px',
              fontWeight: 700,
              cursor: 'pointer',
              background: view === 'section' ? '#f59e0b' : 'transparent',
              color: view === 'section' ? '#241505' : '#64748b',
              transition: 'all 0.15s ease'
            }}
          >
            Joint Check
          </button>
        </div>

        {/* Right Camera Navigation Controls */}
        <div className="camera-action-group" style={{ pointerEvents: 'auto', display: 'flex', flexShrink: 0, marginLeft: 'auto', whiteSpace: 'nowrap', gap: 4, background: 'rgba(255, 255, 255, 0.92)', backdropFilter: 'blur(8px)', padding: 3, borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' }}>
          <button
            className={`btn-ctrl ${navMode === 'orbit' ? 'active' : ''}`}
            onClick={() => setNavMode('orbit')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 10px',
              borderRadius: '7px',
              border: 'none',
              fontSize: '11.5px',
              fontWeight: 700,
              cursor: 'pointer',
              background: navMode === 'orbit' ? '#f59e0b' : 'transparent',
              color: navMode === 'orbit' ? '#241505' : '#475569',
              transition: 'all 0.15s ease'
            }}
          >
            <Move size={12} /> Orbit
          </button>
          <button
            className={`btn-ctrl ${navMode === 'pan' ? 'active' : ''}`}
            onClick={() => setNavMode('pan')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 10px',
              borderRadius: '7px',
              border: 'none',
              fontSize: '11.5px',
              fontWeight: 700,
              cursor: 'pointer',
              background: navMode === 'pan' ? '#f59e0b' : 'transparent',
              color: navMode === 'pan' ? '#241505' : '#475569',
              transition: 'all 0.15s ease'
            }}
          >
            <Hand size={12} /> Pan
          </button>
          <button
            className="btn-ctrl"
            onClick={zoomToFit}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: '7px', border: 'none', background: 'transparent', color: '#475569', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}
          >
            <Maximize2 size={12} /> Fit
          </button>
          <button
            className="btn-ctrl"
            onClick={resetView}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: '7px', border: 'none', background: 'transparent', color: '#475569', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}
          >
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>

      {/* Top Right ViewCube Orientation Indicator */}
      <div style={{ position: 'absolute', top: 74, right: 22, zIndex: 10, pointerEvents: 'none' }}>
        <div style={{ width: 46, height: 46, background: 'rgba(18, 22, 26, 0.85)', border: '1px solid #2a3036', borderRadius: 10, boxShadow: '0 6px 16px rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center' }}>
          <div style={{ textAlign: 'center', lineHeight: 1.1 }}>
            <span style={{ display: 'block', fontSize: 8.5, color: '#e8edf2', fontWeight: 800 }}>TOP</span>
            <span style={{ fontSize: 7, color: '#8b98a5' }}>FRONT</span>
          </div>
        </div>
      </div>

      {/* Right Side Vertical Floating Tool Overlay */}
      <div style={{ position: 'absolute', right: 16, top: '46%', transform: 'translateY(-50%)', zIndex: 10, display: 'flex', flexDirection: 'column', gap: 4, background: 'rgba(18, 22, 26, 0.85)', border: '1px solid #2a3036', borderRadius: 10, padding: 4, boxShadow: '0 6px 16px rgba(0,0,0,0.35)' }}>
        <button style={{ width: 30, height: 30, borderRadius: 7, border: 'none', background: 'transparent', color: '#b6c2ce', display: 'grid', placeItems: 'center', cursor: 'pointer' }} title="Home View">
          <Home size={15} />
        </button>
        <button style={{ width: 30, height: 30, borderRadius: 7, border: 'none', background: 'transparent', color: '#b6c2ce', display: 'grid', placeItems: 'center', cursor: 'pointer' }} title="Zoom In">
          <ZoomIn size={15} />
        </button>
        <button style={{ width: 30, height: 30, borderRadius: 7, border: 'none', background: 'transparent', color: '#b6c2ce', display: 'grid', placeItems: 'center', cursor: 'pointer' }} title="Zoom Out">
          <ZoomOut size={15} />
        </button>
        <button style={{ width: 30, height: 30, borderRadius: 7, border: 'none', background: 'transparent', color: '#b6c2ce', display: 'grid', placeItems: 'center', cursor: 'pointer' }} title="Focus Target">
          <Target size={15} />
        </button>
        <button style={{ width: 30, height: 30, borderRadius: 7, border: 'none', background: 'transparent', color: '#b6c2ce', display: 'grid', placeItems: 'center', cursor: 'pointer' }} title="Measure Tools">
          <Ruler size={15} />
        </button>
      </div>

      {/* 3D Canvas */}
      <div style={{ flex: 1, position: 'relative' }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', outline: 'none' }} aria-label="3D Aluminium Door Model" />
      </div>

      {/* Bottom Preset Gallery Bar */}
      <div className="preset-gallery-bar" style={{ background: 'rgba(16, 18, 21, 0.94)', borderTop: '1px solid #2a3036', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', gap: 9, overflowX: 'auto', flex: 1 }}>
          {[
            { id: 'front', label: 'Front View' },
            { id: 'side', label: 'Side View' },
            { id: 'top', label: 'Top View' },
            { id: '3d', label: '3D View' },
            { id: 'section', label: 'Section View' },
            { id: 'detail', label: 'Detail View' },
          ].map((preset) => {
            const active = activePresetView === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => goPreset(preset.id as 'front' | 'side' | 'top' | '3d' | 'section' | 'detail')}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  width: 88,
                  height: 50,
                  borderRadius: 9,
                  border: active ? '1.5px solid #f59e0b' : '1px solid #2e353c',
                  background: active ? 'rgba(245, 158, 11, 0.14)' : '#1a1f24',
                  boxShadow: active ? '0 0 0 2px rgba(245, 158, 11, 0.2), 0 4px 12px rgba(0,0,0,0.28)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <PresetIcon id={preset.id} active={active} />
                <span style={{ fontSize: 9.5, fontWeight: active ? 800 : 600, color: active ? '#fbbf24' : '#aab4c0', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
                  {preset.label}
                </span>
              </button>
            );
          })}
        </div>
        <button style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #333b44', background: '#1a1f24', display: 'grid', placeItems: 'center', color: '#aab4c0', cursor: 'pointer' }}>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

function PresetIcon({ id, active }: { id: string; active: boolean }) {
  const c = active ? '#fbbf24' : '#cbd5e1';
  const sw = active ? 2.4 : 1.8;
  return (
    <svg viewBox="0 0 48 32" width="34" height="22" aria-hidden style={{ display: 'block', overflow: 'visible' }}>
      <g fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        {id === 'front' && (
          <>
            <rect x="8" y="5" width="32" height="22" rx="2" />
            <path d="M24 5v22" />
            <circle cx="18" cy="16" r="2.2" fill={c} stroke="none" />
          </>
        )}
        {id === 'side' && (
          <>
            <rect x="19" y="4" width="12" height="24" rx="2" />
            <path d="M19 10H5M19 22H9" />
          </>
        )}
        {id === 'top' && (
          <>
            <rect x="5" y="12" width="38" height="8" rx="2" />
            <path d="M17 12V6M17 6H11M17 20v6M17 26h-6" />
          </>
        )}
        {id === '3d' && (
          <>
            <polygon points="24,3 39,9 39,23 24,29 9,23 9,9" />
            <path d="M9 9l15 6 15-6M24 29V15" />
          </>
        )}
        {id === 'section' && (
          <>
            <rect x="7" y="5" width="34" height="22" rx="2" />
            <path d="M7 16h34M13 10l6 6M27 10l6 6M13 16l6 6M27 16l6 6" />
          </>
        )}
        {id === 'detail' && (
          <>
            <circle cx="18" cy="14" r="9" />
            <path d="M25 21l11 10" />
            <circle cx="18" cy="14" r="2.6" fill={c} stroke="none" />
          </>
        )}
      </g>
    </svg>
  );
}
