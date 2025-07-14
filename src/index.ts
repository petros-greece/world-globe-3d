import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import gsap, { set } from 'gsap';

const list: string[] = [];

interface CountryPath {
	path: string;
	name: string;
	x: number;
	y: number;
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

type PositionT = 'start' | 'center' | 'end';

export class InteractiveGlobe {

	public obj: any = {};

	public countryCoordsObj: { [countryName: string]: { x: number; y: number, i: number } } = {};

	public container!: HTMLElement;
	private canvas!: HTMLCanvasElement;
	private svgMap!: SVGSVGElement;
	private svgCountries: SVGPathElement[] = [];
	private countryHighlightEl!: SVGSVGElement;
	private countryNameEl!: HTMLElement | null;

	private renderer!: THREE.WebGLRenderer;
	private scene!: THREE.Scene;
	private camera!: THREE.OrthographicCamera;
	private controls!: OrbitControls;
	private rayCaster!: THREE.Raycaster;
	private pointer: THREE.Vector2 = new THREE.Vector2(-1, -1);

	private globeGroup: THREE.Group = new THREE.Group();
	private globeColorMesh!: THREE.Mesh;
	private globeStrokesMesh!: THREE.Mesh;
	private globeSelectionOuterMesh!: THREE.Mesh;

	private bBoxes: BoundingBox[] = [];
	private dataUris: { [index: number]: string } = {};
	private hoveredCountryIdx = -1;
	private isTouchScreen = false;
	private isHoverable = true;



	private readonly textureLoader = new THREE.TextureLoader();
	private readonly offsetY = -0.1;
	private readonly svgViewBox = [2000, 1000];
	private readonly mapDomId = 'map';



	private readonly params = {
		strokeColor: "#111111",
		defaultColor: "#9a9591",
		hoverColor: "#000000",
		fogColor: "#e4e5e6",
		fogDistance: 2.6,
		strokeWidth: 2,
		hiResScalingFactor: 2,
		lowResScalingFactor: 0.7,
		padding: 50,
		infoPositionX: "center" as PositionT,
		infoPositionY: "start" as PositionT,
		colorType: "random", // 'random' | 'palette',
		palette: ["#9a9591", "#00C9A2", "#111111", "#e4e5e6"],
		minZoom: 0.5,
		maxZoom: 10,
		seaColor: '#2196f3'

	};

	constructor(wrapperSelector: string) {
		const container = document.querySelector(wrapperSelector);
		if (!container) throw new Error("Container not found");
		this.container = container as HTMLElement;
		this.container.style.position = 'relative';
	}

	async create(params: any) {

		Object.assign(this.params, params);

		const response = await fetch("/country-paths.json");
		const countries: CountryPath[] = await response.json();
		this.createGlobeDOMStructure();
		this.renderSvgMapOnDOM(countries);
		this.generateCoordsObj(countries);
		this.initGlobeDOMProprs();
		this.init();

	}

	private createGlobeDOMStructure() {

		// Canvas
		const canvas = document.createElement('canvas');
		Object.assign(canvas.style, {
			cursor: "pointer",
			userSelect: "none",
		});
		this.container.appendChild(canvas);

		// Info display
		const infoDiv = document.createElement('div');
		Object.assign(infoDiv.style, {
			position: "absolute",
			top: "0",
			left: "0",
			width: "100%",
			height: "100%",
			textAlign: "center",
			display: "flex",
			pointerEvents: "none",
			justifyContent: this.params.infoPositionX,
			alignItems: this.params.infoPositionY,
		});

		infoDiv.className = 'info';
		const infoSpan = document.createElement('span');
		Object.assign(infoSpan.style, {
			fontWeight: "bold",
			textShadow: "0 0 5px #ffffff",
			padding: ".2em .6em",
			borderRadius: "2px",
			fontSize: "2em",
		});

		infoDiv.appendChild(infoSpan);
		this.container.appendChild(infoDiv);

		// SVG map container
		const mapContainer = document.createElement('div');
		mapContainer.className = 'map-svg-container';
		this.container.appendChild(mapContainer);

		// Highlight SVG (for selected/hovered country)
		const highlightSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		Object.assign(highlightSvg.style, {
			position: "absolute",
			top: "0",
			left: "0",
			width: "100%",
			height: "100%",
			pointerEvents: "none",
		});
		highlightSvg.classList.add('country');
		this.container.appendChild(highlightSvg);

	}

	// Fetch and render the SVG map from a JSON file
	private renderSvgMapOnDOM(countries: any) {

		const svgNS = "http://www.w3.org/2000/svg";

		const svg = document.createElementNS(svgNS, "svg");
		svg.setAttribute("id", this.mapDomId);
		svg.setAttribute("viewBox", "0 0 2000 1000");
		svg.setAttribute("width", "100%");
		svg.setAttribute("height", "100%");
		svg.style.position = 'absolute';
		svg.style.width = '0';
		svg.style.height = '0';
		svg.style.overflow = 'hidden';
		svg.style.pointerEvents = 'none';  // just in case
		for (const country of countries) {
			const path = document.createElementNS(svgNS, "path");
			path.setAttribute("d", country.path);
			path.setAttribute("data-name", country.name);

			if (this.params.colorType === 'random') {
				const r = Math.floor(Math.random() * 256);
				const g = Math.floor(Math.random() * 256);
				const b = Math.floor(Math.random() * 256);
				const randomColor = `rgb(${r},${g},${b})`;
				//path.setAttribute("data-original-color", randomColor);
				path.setAttribute("fill", randomColor);
			}
			else if (this.params.colorType === 'palette') {
				const palette = this.params.palette || ['#cccccc']; // Fallback color if palette not provided
				const randomColor = palette[Math.floor(Math.random() * palette.length)];
				//path.setAttribute("data-original-color", randomColor);
				path.setAttribute("fill", randomColor);
			}
			svg.appendChild(path);
		}
		this.container.appendChild(svg);

	}

	private generateCoordsObj(countries: any) {
		for (let i = 0; i < countries.length; i++) {

			const country = countries[i];

			// Ensure each country has a name and path
			if (!country.name || !country.path) {
				//console.warn(`Country data missing name or path:`, country);
				continue;
			}

			if (country.x && country.y) {
				this.countryCoordsObj[country.name] = {
					x: country.x,
					y: country.y,
					i: i
				};
			}
			else {
				list.push(country.name);
			}

		}
	}

	/** GLOBE IINITIALAZATION ************************************************************** */

	private init() {
		this.scene = new THREE.Scene();
		this.scene.fog = new THREE.Fog(this.params.fogColor, 0, this.params.fogDistance);

		this.camera = new THREE.OrthographicCamera(-1.2, 1.2, 1.2, -1.2, 0, 3);
		this.camera.position.z = 1.3;

		this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true });
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		this.scene.add(this.globeGroup);

		this.rayCaster = new THREE.Raycaster();
		this.rayCaster.far = 1.15;

		this.createControls();
		this.createGlobe();
		this.prepareTextures();

		this.addEventListeners();
		this.updateSize();

		//start the loop
		gsap.ticker.add(this.render);



	}

	private initGlobeDOMProprs() {

		const canvas = this.container.querySelector("canvas") as HTMLCanvasElement;
		if (!canvas) throw new Error("Canvas not found");
		this.canvas = canvas;

		const mapEl = document.querySelector(`#${this.mapDomId}`) as SVGSVGElement;
		if (!mapEl) throw new Error("SVG map element '#map' not found");
		this.svgMap = mapEl;
		this.svgCountries = Array.from(this.svgMap.querySelectorAll("path"));

		const countryHighlightEl = this.container.querySelector(".country") as SVGSVGElement;
		if (!countryHighlightEl) throw new Error("Country highlight SVG not found");
		this.countryHighlightEl = countryHighlightEl;

		this.countryNameEl = document.querySelector(".info span");
	}

	private createControls() {
		//  Initialize OrbitControls to allow camera orbiting with mouse/touch
		this.controls = new OrbitControls(this.camera, this.canvas);

		// Disable panning so user can only rotate/zoom the globe
		this.controls.enablePan = false;

		// Enable damping for smooth transitions
		this.controls.enableDamping = true;

		// Clamp vertical rotation to avoid flipping over the poles
		this.controls.minPolarAngle = 0;                // Top
		this.controls.maxPolarAngle = Math.PI;          // Bottom

		// Set zoom constraints (add these lines)
		this.controls.minZoom = this.params.minZoom || 0.5; // Minimum zoom level            
		this.controls.maxZoom = this.params.maxZoom || 1.5; // Maximum zoom level

		// On user interaction start (e.g. drag)
		this.controls.addEventListener("start", () => {
			this.isHoverable = false;                    // Disable hover effects while interacting
			this.pointer = new THREE.Vector2(-2, -2);    // Move pointer off-screen to avoid accidental detection

			// Slightly shrink globe for interaction feedback
			gsap.to(this.globeGroup.scale, { duration: 0.3, x: 0.9, y: 0.9, z: 0.9 });
		});

		// On user interaction end (e.g. release)
		this.controls.addEventListener("end", () => {

			console.log(this.camera.position, this.globeGroup.position)
			// Restore globe scale with bounce effect
			gsap.to(this.globeGroup.scale, {
				duration: 0.6,
				x: 1,
				y: 1,
				z: 1,
				ease: "back(1.7).out",
				onComplete: () => {
					this.isHoverable = true;             // Re-enable hover detection
				},
			});
		});



	}

	private createGlobe() {
		// Create base geometry for the globe — using an icosahedron for a smooth sphere
		const geometry = new THREE.IcosahedronGeometry(1, 20);

		// Sea background — slightly larger sphere rendered inside-out
		const seaGeometry = new THREE.IcosahedronGeometry(1.01, 20); // Slightly larger to avoid z-fighting
		const seaMaterial = new THREE.MeshBasicMaterial({
			color: this.params.seaColor,              // Ocean blue color
			transparent: true,
			side: THREE.BackSide          // Render inside of the sphere
		});
		const seaMesh = new THREE.Mesh(seaGeometry, seaMaterial);

		// Create globe color layer (countries fill color)
		this.globeColorMesh = new THREE.Mesh(
			geometry,
			new THREE.MeshBasicMaterial({
				transparent: true,
				alphaTest: 1,                 // Discard fully transparent pixels
				side: THREE.DoubleSide        // Render both front and back faces
			})
		);

		// Create stroke/outline layer
		this.globeStrokesMesh = new THREE.Mesh(
			geometry,
			new THREE.MeshBasicMaterial({
				transparent: true,
				depthTest: false              // Always render strokes on top
			})
		);

		// Create country highlight/selection layer
		this.globeSelectionOuterMesh = new THREE.Mesh(
			geometry,
			new THREE.MeshBasicMaterial({
				transparent: true,
				side: THREE.DoubleSide,        // Visible from all directions
			})
		);

		// Add all globe layers to the main group
		this.globeGroup.add(
			seaMesh,
			this.globeColorMesh,
			this.globeStrokesMesh,
			this.globeSelectionOuterMesh,
		);


		// this.globeSelectionOuterMesh.visible = false; 

		//this.globeGroup.rotateY(Math.PI / 2); // Rotate globe to face the right way
	}

	private updateSize() {
		// Determine the smallest side of the window and subtract some margin (50px)
		const side = Math.min(window.innerWidth, window.innerHeight) - this.params.padding;

		// Resize the container to be a square (width = height = side)
		this.container.style.width = `${side}px`;
		this.container.style.height = `${side}px`;

		// Resize the Three.js renderer to match the new size
		this.renderer.setSize(side, side);
	}

	private addEventListeners() {
		let arr = [];
		// Update canvas size on window resize to maintain correct aspect ratio
		window.addEventListener("resize", () => this.updateSize());

		// Track mouse movement to update pointer position for hover detection
		this.container.addEventListener("mousemove", (e: MouseEvent) => this.updatePointer(e.clientX, e.clientY));

		// On touch interaction, mark the device as touch-enabled
		this.container.addEventListener("touchstart", () => {
			this.isTouchScreen = true;
		});

		// Handle clicks on the globe to select countries
		this.container.addEventListener("click", (e: MouseEvent) => {

			// const camPos = this.camera.position.clone();
			// const spherical = new THREE.Spherical().setFromVector3(camPos);
			// arr.push({phi:spherical.phi, theta:spherical.theta})
			// console.log('spherical', arr)


			// Update pointer for raycasting
			this.updatePointer(e.clientX, e.clientY);

			// Set up raycaster to detect intersections with the globe
			this.rayCaster.setFromCamera(this.pointer, this.camera);
			const intersects = this.rayCaster.intersectObject(this.globeStrokesMesh);

			if (intersects.length) {
				// Convert UV coordinates into country index
				const uv = intersects[0].uv;
				const idx = this.detectCountryFromUV(uv);

				if (idx !== null) {
					this.hoveredCountryIdx = idx;
					// Display the name of the clicked country
					const path = this.svgCountries[idx];
					const name = path.getAttribute("data-name") ?? "";

					// Dispatch a custom event
					this.container.dispatchEvent(new CustomEvent("countryClick", {
						detail: {
							name,
							index: idx,
							path,
						},
						bubbles: true, // optional, allows the event to bubble up
					}));

					if (this.countryNameEl) this.countryNameEl.innerHTML = name;

					// Highlight the selected country using its unique texture
					this.setMapTexture(
						this.globeSelectionOuterMesh.material as SetMapTextureMaterial,
						this.dataUris[idx]
					);

					// Optional debug logging for lat/lon the camera is facing
					this.logCameraDirectionAsLatLon();
				}
			}
		});
	}

	/** TEXTURES ************************************************************** */

	private setMapTexture(material: SetMapTextureMaterial, URI: string) {
		// Load the texture from a given data URI (SVG rendered as image)
		this.textureLoader.load(URI, (texture) => {
			// Ensure the texture doesn't tile — one full image on the globe
			texture.repeat.set(1, 1);
			// Apply the texture to the material
			material.map = texture;
			// Force material to refresh/render with the new texture
			material.needsUpdate = true;
		});
	}

	//ONINIT
	private prepareTextures() {

		this.updateBaseTexture();
		// Now apply a stroke-only version of the map as a separate texture
		this.updateStrokeTexture();
		// Set up the "country highlight" SVG used for hovering/selection overlays
		this.updateSelectionTexture();
	}

	public updateBaseTexture(): void {
		// 1. Clone the SVG so we don’t mutate the DOM one
		const svgClone = this.svgMap.cloneNode(true) as SVGSVGElement;

		// 2. Apply your viewBox, stroke and sizing tweaks to the clone
		gsap.set(svgClone, {
			attr: {
				viewBox: `0 ${this.offsetY * this.svgViewBox[1]} ${this.svgViewBox[0]} ${this.svgViewBox[1]}`,
				"stroke-width": this.params.strokeWidth,
				stroke: this.params.strokeColor,
				width: this.svgViewBox[0] * this.params.hiResScalingFactor,
				height: this.svgViewBox[1] * this.params.hiResScalingFactor,
			},
		});

		// 3. Serialize & upload
		const xml = new XMLSerializer().serializeToString(svgClone);
		const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
		this.setMapTexture(
			this.globeColorMesh.material as SetMapTextureMaterial,
			uri
		);
	}

	private updateStrokeTexture(): void {
		// 1. Clone the SVG so we don’t stomp on the base clone or DOM SVG
		const svgClone = this.svgMap.cloneNode(true) as SVGSVGElement;

		// 2. Remove fills and set stroke attrs on the clone
		gsap.set(svgClone, {
			attr: {
				fill: "none",
				stroke: this.params.strokeColor,
				"stroke-width": this.params.strokeWidth,
				viewBox: `0 ${this.offsetY * this.svgViewBox[1]} ${this.svgViewBox[0]} ${this.svgViewBox[1]}`,
				width: this.svgViewBox[0] * this.params.hiResScalingFactor,
				height: this.svgViewBox[1] * this.params.hiResScalingFactor,
			},
		});

		// 3. Serialize & upload
		const xml = new XMLSerializer().serializeToString(svgClone);
		const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
		this.setMapTexture(
			this.globeStrokesMesh.material as SetMapTextureMaterial,
			uri
		);
	}

	private updateSelectionTexture(): void {
		// Prepare per-country highlight textures without touching the live DOM paths
		this.svgCountries.forEach((origPath, idx) => {
			// 1. Clone just the <svg> container (empty) for this country
			const highlightSvg = this.countryHighlightEl.cloneNode(false) as SVGSVGElement;

			// 2. Set up its SVG attributes (viewBox, sizing, stroke, fill on clone)
			gsap.set(highlightSvg, {
				attr: {
					viewBox: `0 ${this.offsetY * this.svgViewBox[1]} ${this.svgViewBox[0]} ${this.svgViewBox[1]}`,
					"stroke-width": this.params.strokeWidth,
					stroke: this.params.strokeColor,
					fill: this.params.hoverColor,
					width: this.svgViewBox[0] * this.params.lowResScalingFactor,
					height: this.svgViewBox[1] * this.params.lowResScalingFactor,
				},
			});

			// 3. Clone the individual country path, apply hover fill
			const pathClone = origPath.cloneNode(true) as SVGPathElement;
			pathClone.setAttribute("fill", this.params.hoverColor);

			// 4. Append the cloned path into the cloned <svg>
			highlightSvg.appendChild(pathClone);

			// 5. Serialize the highlight SVG and store its data‑URI
			const data = new XMLSerializer().serializeToString(highlightSvg);
			this.dataUris[idx] = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(data)}`;

			// 6. Cache its bbox from the original path for hit‑testing
			this.bBoxes[idx] = origPath.getBBox();
		});

		// 7. Set the “no‑selection” dummy (idx 0) and prime the selection mesh
		//    Ensure dataUris[0] exists (e.g. an empty 1×1 SVG) if you need a fallback.
		this.setMapTexture(
			this.globeSelectionOuterMesh.material as SetMapTextureMaterial,
			this.dataUris[0]
		);
	}


	/** EVENT RELATED ************************************************************** */

	public setGlobeCountryColor(name: string, newColor: string): void {
		// 1) Find and update the live SVG path
		const path = this.svgCountries.find(p => p.getAttribute('data-name') === name);
		if (!path) {
			console.warn(`Country "${name}" not found.`);
			return;
		}
		path.setAttribute('fill', newColor);

		// 2) Re‑generate all three textures from the mutated SVG
		this.updateBaseTexture();
		this.updateStrokeTexture();
		this.updateSelectionTexture();

		// 3) Force Three.js to refresh each of the maps & materials
		const mats = [
			this.globeColorMesh.material as SetMapTextureMaterial,
			this.globeStrokesMesh.material as SetMapTextureMaterial,
			this.globeSelectionOuterMesh.material as SetMapTextureMaterial,
		];
		for (const mat of mats) {
			if (mat.map) mat.map.needsUpdate = true;
			mat.needsUpdate = true;
		}
	}

	private detectCountryFromUV(uv = { x: 0, y: 0 }): number | null {
		// Convert UV coordinates (from raycasting) to SVG coordinate space
		const point = this.svgMap.createSVGPoint();
		point.x = uv.x * this.svgViewBox[0];
		point.y = (1 + this.offsetY - uv.y) * this.svgViewBox[1]; // Flip Y and apply vertical offset

		// 🔍 Loop through all countries to find which one contains the point
		for (let i = 0; i < this.svgCountries.length; i++) {
			const box = this.bBoxes[i]; // Cached bounding box for performance

			// First, do a fast bounding box check before more expensive fill check
			if (
				point.x > box.x &&
				point.x < box.x + box.width &&
				point.y > box.y &&
				point.y < box.y + box.height
			) {
				// Perform precise test to see if the point is inside the country's shape
				if (this.svgCountries[i].isPointInFill(point)) return i;
			}
		}

		//  No match found
		return null;
	}

	private updatePointer(x: number, y: number) {
		// 📏 Get the position and size of the container element
		const bounds = this.container.getBoundingClientRect();

		// 🎯 Convert screen (pixel) coordinates to normalized device coordinates (NDC)
		// NDC range is [-1, 1], with (0, 0) at the center of the screen
		this.pointer.x = ((x - bounds.left) / bounds.width) * 2 - 1;
		this.pointer.y = -((y - bounds.top) / bounds.height) * 2 + 1;

		// These NDC coordinates are used by THREE.Raycaster to trace rays correctly
	}

	private render = () => {

		// Adjust rotation speed based on zoom level
		//this.controls.rotateSpeed = this.getRotateSpeedFromZoom(this.camera.zoom);
		//this.controls.update(); // Apply any ongoing camera transformations (like damping)

		// Handle hover interaction only if allowed
		if (this.isHoverable) {
			//console.log(this.globeGroup.rotation)
			// Update raycaster from current pointer position
			this.rayCaster.setFromCamera(this.pointer, this.camera);

			// Detect intersection with the globe's stroke mesh
			const intersects = this.rayCaster.intersectObject(this.globeStrokesMesh);
			//console.log(intersects)
			if (intersects.length) {
				const uv = intersects[0].uv; // 📍 Get UV coords of intersection
				const idx = this.detectCountryFromUV(uv); // 🗺 Find matching country path

				if (idx !== null && idx !== this.hoveredCountryIdx) {

					//this.renderWithSimpleHover(idx);

					// Show the country's name
					if (this.countryNameEl) {
						const name = this.svgCountries[idx].getAttribute("data-name");
						this.countryNameEl.innerHTML = name + ` --  ${this.hoveredCountryIdx}` || "";
					}
				}
				// else {
				// 	this.setMapTexture(
				// 		this.globeSelectionOuterMesh.material as SetMapTextureMaterial,
				// 		this.dataUris[0]
				// 	);
				// }
			}
		}

		// Disable hover if device is touch-based
		if (this.isTouchScreen && this.isHoverable) this.isHoverable = false;
		// Final render
		this.renderer.render(this.scene, this.camera);
	};

	private logCameraDirectionAsLatLon() {
		const cameraToGlobe = new THREE.Vector3()
			.subVectors(this.globeGroup.position, this.camera.position)
			.normalize(); // From camera to center of globe

		const lat = THREE.MathUtils.radToDeg(Math.asin(cameraToGlobe.y));
		const lon = THREE.MathUtils.radToDeg(Math.atan2(cameraToGlobe.x, cameraToGlobe.z));

		const countryElement = this.svgCountries[this.hoveredCountryIdx];
		const countryName = countryElement?.getAttribute("data-name");

		console.log(`,"x": ${Number(lat.toFixed(2))}, "y": ${Number(lon.toFixed(2))}`);

		if (this.obj[`${countryName}`]) {
			this.obj[`${countryName}`].lat = lat.toFixed(2);
			this.obj[`${countryName}`].lon = lon.toFixed(2);
		}
		else {
			this.obj[`${countryName}`] = {
				lat: Number(lat.toFixed(2)),
				lon: Number(lon.toFixed(2))
			};
		}
		console.log(this.obj);

		// console.log(this.globeGroup)
		// console.log(this.globeGroup.quaternion)

	}

	/** STILL TESTING ************************************************************** */

	public focusLatLon(coords: { lat: number, lon: number }) {
		const phi = THREE.MathUtils.degToRad(-90 - coords.lat);
		const theta = THREE.MathUtils.degToRad(coords.lon);

		// Get target direction and position
		const targetDirection = new THREE.Vector3()
			.setFromSphericalCoords(1, phi, theta)
			.normalize();

		// Get current camera position and direction
		const currentCameraPos = this.camera.position.clone();
		const currentDirection = currentCameraPos.clone().normalize();

		// Calculate rotation between current and target directions
		const rotationQuat = new THREE.Quaternion()
			.setFromUnitVectors(currentDirection, targetDirection);

		// Animation parameters
		const animProxy = { progress: 0 };
		const tempVector = new THREE.Vector3();
		const tempQuat = new THREE.Quaternion();

		this.controls.enabled = false;

		gsap.to(animProxy, {
			progress: 1,
			duration: 1.5,
			ease: "power2.inOut",
			onUpdate: () => {
				// Spherical interpolation of rotation
				tempQuat.slerpQuaternions(
					new THREE.Quaternion(), // Start at identity
					rotationQuat,
					animProxy.progress
				);

				// Apply rotation to current position
				tempVector.copy(currentCameraPos)
					.applyQuaternion(tempQuat);

				// Set new camera position
				this.camera.position.copy(tempVector);
				this.camera.lookAt(0, 0, 0);
				this.controls.update();
			},
			onComplete: () => {
				this.controls.enabled = true;
			}
		});
	}

	public focusOnCountry(name: string) {
		if (this.countryCoordsObj[name]) {
			const coords = this.countryCoordsObj[name];

			this.focusLatLon({
				lat: coords.x,
				lon: coords.y
			});

			this.setMapTexture(
				this.globeSelectionOuterMesh.material as SetMapTextureMaterial,
				this.dataUris[coords.i]
			);
		}
	}

	/** TODO ************************************************************** */


	public clearSelection() {
		this.hoveredCountryIdx = -1;
		//(this.globeSelectionOuterMesh.material as SetMapTextureMaterial).map = null;
		// (this.globeSelectionOuterMesh.material as SetMapTextureMaterial).needsUpdate = true;
	}




}

const globe = new InteractiveGlobe(".globe-wrapper");

await globe.create({
	infoPositionX: "center",
	infoPositionY: "start",
	colorType: "palette", // 'random' | 'palette'
	palette: [
		'#FF6B6B', // Red
		'#4ECDC4', // Teal
		'#C7F464', // Lime
		'#556270', // Dark Blue-Gray
		'#C44D58', // Crimson
		'#FFA07A', // Light Salmon
		'#FFD700', // Gold
		'#9ACD32', // Yellow Green
		'#00CED1', // Dark Turquoise
		'#1E90FF', // Dodger Blue
		'#7B68EE', // Medium Slate Blue
		'#8A2BE2', // Blue Violet
		'#FF69B4', // Hot Pink
		'#DDA0DD', // Plum
		'#20B2AA', // Light Sea Green
		'#66CDAA', // Medium Aquamarine
		'#BDB76B', // Dark Khaki
		'#FF8C00', // Dark Orange
		'#DC143C', // Crimson Red
		'#2E8B57'  // Sea Green
	]
})

// testing

// let i = 0;
// for (let countryName in globe.countryCoordsObj) {
// 	setTimeout(() => {
// 		globe.focusOnCountry(countryName);
// 		//globe.rotateGlobeToLatLon('Greece')

// 	}, 2000 * i)
// 	i += 1;
// }


globe.container.addEventListener("countryClick", (e: Event) => {
	const event = e as CustomEvent;
	console.log("Clicked country:", event.detail.name, event.detail.index);
	// You can now use event.detail.name, .index, .path, etc.
});

//setTimeout(() => {
// 	console.log(globe)
// 	//globe.clearSelection()
// 	// Update the base texture to reflect any changes made to the SVG map
// 	// globe.focusLatLon({
// 	// "lat": -8.88,
// 	// "lon": 59.47
// 	// });
//	globe.focusOnCountry("France"); // Focus on Finland
//globe.rotateGlobeToCountry('South Africa')
// 	for (let i = 0; i < list.length; i++) {
// 		const countryName = list[i];
// 		globe.setGlobeCountryColor(countryName, "red");
// 	}
//globe.focusOnCountry("Greece");
//globe.setGlobeCountryColor("Russia", "red");
//}, 3000);

setTimeout(() => {
	//globe.focusOnCountry("United States");
	globe.setGlobeCountryColor("Russia", "red");
}, 2000)

// setTimeout(() => {
//	globe.focusOnCountry("Canada");
// }, 6000)

// setTimeout(() => {
// 	globe.focusOnCountry("China");
// }, 4000)

// setTimeout(() => {
// 	globe.focusOnCountry("Greece");
// }, 8000)


// // Compute target spherical coordinates from country lat/lon:
// const phiTarget   = THREE.MathUtils.degToRad( 90 - countryLat );
// const thetaTarget = THREE.MathUtils.degToRad( countryLon );

// // Record current camera spherical coords:
// const camPos = this.camera.position.clone();
// const spherical = new THREE.Spherical().setFromVector3(camPos);
// const radius = spherical.radius; // keep distance fixed

// // Tween the spherical angles with GSAP:
// gsap.to(spherical, {
//   duration: 1.5,
//   phi: phiTarget,
//   theta: thetaTarget,
//   onUpdate: () => {
//     // Recompute camera position at each frame
//     const newPos = new THREE.Vector3().setFromSpherical(spherical).multiplyScalar(radius);
//     this.camera.position.copy(newPos);
//     this.camera.lookAt(0,0,0);
//   },
//   onComplete: () => {
//     this.controls.enabled = true;
//   }
// });