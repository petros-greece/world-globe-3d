import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MeshStandardMaterial, Material } from 'three';
import gsap from 'gsap';


type CountryPath = {
  path: string;
  name: string;
};

async function renderSvgMap(containerId: string) {
  const response = await fetch("/country-paths.json");
  const countries: CountryPath[] = await response.json();

  const svgNS = "http://www.w3.org/2000/svg";

  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("id", "map");
  svg.setAttribute("viewBox", "0 0 2000 1000"); // Optional: adjust to your content
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");

  for (const country of countries) {
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", country.path);
    path.setAttribute("data-name", country.name);
    // path.setAttribute("fill", "#ccc"); // Customize as needed
    // path.setAttribute("stroke", "#333");
    // path.setAttribute("stroke-width", "1");
    svg.appendChild(path);
  }

  const container = document.getElementById(containerId);
  if (container) {
    container.innerHTML = ""; // clear existing
    container.appendChild(svg);
  } else {
    console.error(`Container element with id '${containerId}' not found.`);
  }
}

await renderSvgMap("map-container");


interface DataUriMap {
	[index: number]: string;
}

interface BoundingBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface SetMapTextureMaterial extends THREE.Material {
	map: THREE.Texture | null;
}

const containerEl = document.querySelector(".globe-wrapper");
if (!containerEl) {
	throw new Error("Container element '.globe-wrapper' not found.");
}
const canvasEl = containerEl.querySelector("#globe-3d");
if (!canvasEl) {
	throw new Error("Canvas element '#globe-3d' not found inside '.globe-wrapper'.");
}
const svgMapDomEl = document.querySelector("#map");
if (!svgMapDomEl) {
	throw new Error("SVG map element '#map' not found.");
}
const svgCountries = Array.from(svgMapDomEl.querySelectorAll("path"));

const svgCountryDomEl = document.querySelector("#country");
const countryNameEl = document.querySelector(".info span");

let renderer: THREE.WebGLRenderer,
	scene: THREE.Scene,
	camera: THREE.OrthographicCamera,
	rayCaster: THREE.Raycaster,
	pointer: THREE.Vector2,
	controls: OrbitControls,
	globeGroup: THREE.Group,
	globeColorMesh: THREE.Mesh,
	globeStrokesMesh: THREE.Mesh,
	globeSelectionOuterMesh: THREE.Mesh;

const svgViewBox = [2000, 1000];
const offsetY = -0.1;

const params = {
	strokeColor: "#111111",
	defaultColor: "#9a9591",
	hoverColor: "#00C9A2",
	fogColor: "#e4e5e6",
	fogDistance: 2.6,
	strokeWidth: 1,
	hiResScalingFactor: 2,
	lowResScalingFactor: 0.7
};

let hoveredCountryIdx = 29;
let isTouchScreen = false;
let isHoverable = true;

const textureLoader = new THREE.TextureLoader();
let staticMapUri;

const bBoxes: BoundingBox[] = [];
const dataUris: DataUriMap = [];

initScene();

window.addEventListener("resize", updateSize);

containerEl.addEventListener("touchstart", (e) => {
	isTouchScreen = true;
});
containerEl.addEventListener("mousemove", (e) => {
	const mouseEvent = e as MouseEvent;
	updateMousePosition(mouseEvent.clientX, mouseEvent.clientY);
});
containerEl.addEventListener("click", (e) => {
	const mouseEvent = e as MouseEvent;
	updateMousePosition(mouseEvent.clientX, mouseEvent.clientY);

	// Raycast
	rayCaster.setFromCamera(pointer, camera);
	const intersects = rayCaster.intersectObject(globeStrokesMesh);

	if (intersects.length) {
		const uv = intersects[0].uv;
		const clickedCountry = detectCountryFromUV(uv);
		if (clickedCountry !== null) {
			const countryPath = svgCountries[clickedCountry];
			const countryName = countryPath.getAttribute("data-name") ?? "";

			// 🔥 YOUR CUSTOM CLICK HANDLER HERE
			console.log("Clicked country:", countryName);

			// Optional: visual update
			hoveredCountryIdx = clickedCountry;
			const material = Array.isArray(globeSelectionOuterMesh.material)
				? globeSelectionOuterMesh.material[0] as MeshStandardMaterial
				: globeSelectionOuterMesh.material as MeshStandardMaterial;

			setMapTexture(material, dataUris[hoveredCountryIdx]);
			if (countryNameEl) {
				countryNameEl.innerHTML = countryName;
			}
		}
	}
});


function detectCountryFromUV(uv = { x: 0, y: 0 }) {
	if (!svgMapDomEl) {
		return null;
	}
	const pointObj = (svgMapDomEl as SVGSVGElement).createSVGPoint();
	pointObj.x = uv.x * svgViewBox[0];
	pointObj.y = (1 + offsetY - uv.y) * svgViewBox[1];

	for (let i = 0; i < svgCountries.length; i++) {
		const boundingBox = bBoxes[i];
		if (
			pointObj.x > boundingBox.x &&
			pointObj.x < boundingBox.x + boundingBox.width &&
			pointObj.y > boundingBox.y &&
			pointObj.y < boundingBox.y + boundingBox.height
		) {
			const isHovering = svgCountries[i].isPointInFill(pointObj);
			if (isHovering) return i;
		}
	}
	return null;
}

function updateMousePosition(eX: number, eY: number): void {
	pointer.x = ((eX - (containerEl as HTMLElement).offsetLeft) / (containerEl as HTMLElement).offsetWidth) * 2 - 1;
	pointer.y = -((eY - (containerEl as HTMLElement).offsetTop) / (containerEl as HTMLElement).offsetHeight) * 2 + 1;
}

function initScene() {
	renderer = new THREE.WebGLRenderer({ canvas: canvasEl as HTMLCanvasElement, alpha: true });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

	scene = new THREE.Scene();
	scene.fog = new THREE.Fog(params.fogColor, 0, params.fogDistance);

	camera = new THREE.OrthographicCamera(-1.2, 1.2, 1.2, -1.2, 0, 3);
	camera.position.z = 1.3;

	globeGroup = new THREE.Group();
	scene.add(globeGroup);

	rayCaster = new THREE.Raycaster();
	rayCaster.far = 1.15;
	pointer = new THREE.Vector2(-1, -1);

	createOrbitControls();
	createGlobe();
	prepareHiResTextures();
	prepareLowResTextures();

	updateSize();

	gsap.ticker.add(render);
}

function createOrbitControls() {
	controls = new OrbitControls(camera, canvasEl as HTMLCanvasElement);
	controls.enablePan = false;
	// controls.enableZoom = false;
	controls.enableDamping = true;
	//controls.minPolarAngle = 0.46 * Math.PI;
	//controls.maxPolarAngle = 0.46 * Math.PI; 

	controls.minPolarAngle = 0;
	controls.maxPolarAngle = Math.PI;

	//controls.autoRotate = false;
	//controls.autoRotateSpeed *= 1.2;

	//console.log(controls.rotateSpeed, globeGroup.scale);

	controls.addEventListener("start", () => {
		isHoverable = false;
		pointer = new THREE.Vector2(-2, -2);
		gsap.to(globeGroup.scale, {
			duration: 0.3,
			x: 0.9,
			y: 0.9,
			z: 0.9,
			ease: "power1.inOut"
		});
	});
	controls.addEventListener("end", () => {
		// isHoverable = true;
		gsap.to(globeGroup.scale, {
			duration: 0.6,
			x: 1,
			y: 1,
			z: 1,
			ease: "back(1.7).out",
			onComplete: () => {
				isHoverable = true;
			}
		});
	});

}

function createGlobe() {
	const globeGeometry = new THREE.IcosahedronGeometry(1, 20);

	const globeColorMaterial = new THREE.MeshBasicMaterial({
		transparent: true,
		alphaTest: 1,
		side: THREE.DoubleSide
	});
	const globeStrokeMaterial = new THREE.MeshBasicMaterial({
		transparent: true,
		depthTest: false
	});
	const outerSelectionColorMaterial = new THREE.MeshBasicMaterial({
		transparent: true,
		side: THREE.DoubleSide
	});

	globeColorMesh = new THREE.Mesh(globeGeometry, globeColorMaterial);
	globeStrokesMesh = new THREE.Mesh(globeGeometry, globeStrokeMaterial);
	globeSelectionOuterMesh = new THREE.Mesh(
		globeGeometry,
		outerSelectionColorMaterial
	);

	globeStrokesMesh.renderOrder = 2;

	globeGroup.add(globeStrokesMesh, globeSelectionOuterMesh, globeColorMesh);
}

function setMapTexture(material: SetMapTextureMaterial, URI: string): void {
	textureLoader.load(URI, (t: THREE.Texture) => {
		t.repeat.set(1, 1);
		material.map = t;
		material.needsUpdate = true;
	});
}

function prepareHiResTextures() {
	let svgData;
	gsap.set(svgMapDomEl, {
		attr: {
			viewBox:
				"0 " + offsetY * svgViewBox[1] + " " + svgViewBox[0] + " " + svgViewBox[1],
			"stroke-width": params.strokeWidth,
			stroke: params.strokeColor,
			fill: params.defaultColor,
			width: svgViewBox[0] * params.hiResScalingFactor,
			height: svgViewBox[1] * params.hiResScalingFactor
		}
	});
	svgData = new XMLSerializer().serializeToString(svgMapDomEl!);
	staticMapUri =
		"data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgData);
	setMapTexture(
		(Array.isArray(globeColorMesh.material)
			? globeColorMesh.material[0]
			: globeColorMesh.material) as SetMapTextureMaterial,
		staticMapUri
	);

	gsap.set(svgMapDomEl, {
		attr: {
			fill: "none",
			stroke: params.strokeColor
		}
	});
	svgData = new XMLSerializer().serializeToString(svgMapDomEl!);
	staticMapUri =
		"data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgData);
	setMapTexture(
		(Array.isArray(globeStrokesMesh.material)
			? globeStrokesMesh.material[0]
			: globeStrokesMesh.material) as SetMapTextureMaterial,
		staticMapUri
	);
	if (countryNameEl) {
		countryNameEl.innerHTML = svgCountries[hoveredCountryIdx].getAttribute("data-name") ?? "";
	}

}

function prepareLowResTextures() {
	gsap.set(svgCountryDomEl, {
		attr: {
			viewBox:
				"0 " + offsetY * svgViewBox[1] + " " + svgViewBox[0] + " " + svgViewBox[1],
			"stroke-width": params.strokeWidth,
			stroke: params.strokeColor,
			fill: params.hoverColor,
			width: svgViewBox[0] * params.lowResScalingFactor,
			height: svgViewBox[1] * params.lowResScalingFactor
		}
	});
	svgCountries.forEach((path, idx) => {
		bBoxes[idx] = path.getBBox();
	});
	svgCountries.forEach((path, idx) => {
		if (svgCountryDomEl) {
			svgCountryDomEl.innerHTML = "";
			svgCountryDomEl.appendChild(svgCountries[idx].cloneNode(true));
			const svgData = new XMLSerializer().serializeToString(svgCountryDomEl);
			dataUris[idx] =
				"data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgData);
		}
	});
	setMapTexture(
		(Array.isArray(globeSelectionOuterMesh.material)
			? globeSelectionOuterMesh.material[0]
			: globeSelectionOuterMesh.material) as SetMapTextureMaterial,
		dataUris[hoveredCountryIdx]
	);
}

function updateMap(uv = { x: 0, y: 0 }) {
	if (!svgMapDomEl) {
		return;
	}
	const pointObj = (svgMapDomEl as SVGSVGElement).createSVGPoint();
	pointObj.x = uv.x * svgViewBox[0];
	pointObj.y = (1 + offsetY - uv.y) * svgViewBox[1];

	for (let i = 0; i < svgCountries.length; i++) {
		const boundingBox = bBoxes[i];
		if (
			pointObj.x > boundingBox.x ||
			pointObj.x < boundingBox.x + boundingBox.width ||
			pointObj.y > boundingBox.y ||
			pointObj.y < boundingBox.y + boundingBox.height
		) {
			const isHovering = svgCountries[i].isPointInFill(pointObj);
			if (isHovering) {
				if (i !== hoveredCountryIdx) {
					hoveredCountryIdx = i;
					setMapTexture(
						(Array.isArray(globeSelectionOuterMesh.material)
							? globeSelectionOuterMesh.material[0]
							: globeSelectionOuterMesh.material) as SetMapTextureMaterial,
						dataUris[hoveredCountryIdx]
					);
					if (countryNameEl) {
						countryNameEl.innerHTML = svgCountries[hoveredCountryIdx].getAttribute("data-name") ?? "";
					}
					break;
				}
			}
		}
	}
}

function render() {

	const distance = controls.getDistance();

	controls.rotateSpeed = getRotateSpeedFromZoom(camera.zoom);
	// console.log(controls.rotateSpeed, camera.zoom);
	controls.update();

	if (isHoverable) {
		rayCaster.setFromCamera(pointer, camera);
		const intersects = rayCaster.intersectObject(globeStrokesMesh);
		if (intersects.length) {
			updateMap(intersects[0].uv);
		}
	}

	if (isTouchScreen && isHoverable) {
		isHoverable = false;
	}

	renderer.render(scene, camera);
}

function updateSize() {
	const side = Math.min(window.innerWidth, window.innerHeight) - 50;

	if (containerEl) {
		(containerEl as HTMLElement).style.width = side + "px";
		(containerEl as HTMLElement).style.height = side + "px";
	}
	renderer.setSize(side, side);
}

function getRotateSpeedFromZoom(zoom: number): number {
	const minZoom = 0.5; // max zoom out
	const maxZoom = 3.0; // max zoom in

	const minSpeed = 0.5;
	const maxSpeed = 2.5;

	const t: number = (zoom - minZoom) / (maxZoom - minZoom);
	return THREE.MathUtils.clamp(minSpeed + (1 - t) * (maxSpeed - minSpeed), minSpeed, maxSpeed);
}










