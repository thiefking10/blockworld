import * as THREE from "three";
import { Controls } from "./controls";
import { buildMesh } from "./mesher";
import { EYE_HEIGHT, Player } from "./player";
import { SIZE_X, SIZE_Z, World } from "./world";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const fpsLabel = document.getElementById("fps") as HTMLElement;

const seedParam = new URLSearchParams(window.location.search).get("seed");
const seed = seedParam ? Number(seedParam) || 1 : Math.floor(Math.random() * 100000);

const world = new World();
world.generate(seed);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const sky = new THREE.Color(0x87ceeb);
const scene = new THREE.Scene();
scene.background = sky;
scene.fog = new THREE.Fog(sky, 30, 70);
scene.add(buildMesh(world));

const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 120);
camera.rotation.order = "YXZ";

function resize(): void {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

const player = new Player(world);
player.x = SIZE_X / 2;
player.z = SIZE_Z / 2;
player.y = world.surfaceHeight(Math.floor(player.x), Math.floor(player.z)) + 1;

const controls = new Controls(canvas);

let last = performance.now();
let frames = 0;
let fpsTimer = 0;

function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  const look = controls.consumeLook();
  player.yaw += look.yaw;
  player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch + look.pitch));
  player.update(dt, controls.currentInput());

  camera.position.set(player.x, player.y + EYE_HEIGHT, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
  renderer.render(scene, camera);

  frames++;
  fpsTimer += dt;
  if (fpsTimer >= 0.5) {
    fpsLabel.textContent = `${Math.round(frames / fpsTimer)} FPS · seed ${seed}`;
    frames = 0;
    fpsTimer = 0;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
