import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { InteractiveGlobeVars, CountryPath } from './InteractiveGlobeVars';
import gsap from 'gsap';

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SetMapTextureMaterial extends THREE.Material {
  map: THREE.Texture | null;
}

type EventHandler<T extends Event = Event> = (event: T) => void;

interface GlobeListener<T extends Event = Event> {
  element: EventTarget;
  type: string;
  handler: EventHandler<T>;
  options?: AddEventListenerOptions;
}

type PositionT = 'start' | 'center' | 'end';

export type GlobeParams = {
  strokeColor?: string;
  defaultColor?: string;
  hoverColor?: string;
  fogColor?: string;
  fogDistance?: number;
  strokeWidth?: number;
  hiResScalingFactor?: number;
  lowResScalingFactor?: number;
  padding?: number;
  infoPositionX?: PositionT;
  infoPositionY?: PositionT;
  colorType?: 'random' | 'palette' | 'map';
  palette?: string[];
  mapColors?: Record<string, string>;
  minZoom?: number;
  maxZoom?: number;
  seaColor?: string;
  seaTransparent?: boolean;
  clickScale?: number;
  autoRotate?: boolean;
  autoRotateSpeed?: number;
}

export default class InteractiveGlobe extends InteractiveGlobeVars {

  public obj: any = {
    points: [],
    pulsingPoints: [],
    countryAnimations: {}
  };

  public countryCoordsObj: { [countryName: string]: { x: number; lat: number, lon: number, i: number } } = {};
  private listeners: GlobeListener[] = [];

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
  private dynamicRender: Function = (() => { });

  private params = {
    strokeColor: "#111111",
    defaultColor: "#9a9591",
    hoverColor: "#000000",
    fogColor: "#2196f3",
    fogDistance: 2.6,
    strokeWidth: 2,
    hiResScalingFactor: 2,
    lowResScalingFactor: 0.7,
    padding: 50,
    infoPositionX: "center" as PositionT,
    infoPositionY: "start" as PositionT,
    colorType: "random", // 'random' | 'palette' | 'map',
    palette: ["#9a9591", "#00C9A2", "#111111", "#e4e5e6"],
    mapColors: { 'Greece': 'red' } as any,
    minZoom: 0.5,
    maxZoom: 10,
    seaColor: '#2196f3',
    seaTransparent: true,
    clickScale: .9,
    autoRotate: false,
    autoRotateSpeed: 1.2,
  };

  constructor(wrapperSelector: string) {
    super();
    const container = document.querySelector(wrapperSelector);
    if (!container) throw new Error("Container not found");
    this.container = container as HTMLElement;
    this.container.style.position = 'relative';
  }

  create(params: GlobeParams) {
    this.params = { ...this.params, ...params };
    this.createGlobeDOMStructure();
    this.renderSvgMapOnDOM();
    this.generateCoordsObj();
    this.initGlobeDOMProprs();
    this.init();

  }

  private createGlobeDOMStructure() {
    // Clear container before recreating
    this.container.innerHTML = '';
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
    this.canvas = canvas;
  }

  // Fetch and render the SVG map from a JSON file
  private renderSvgMapOnDOM() {

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
    const countries = [...this.countryData];
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
        const palette = this.params.palette || [this.params.defaultColor]; // Fallback color if palette not provided
        const randomColor = palette[Math.floor(Math.random() * palette.length)];
        //path.setAttribute("data-original-color", randomColor);
        path.setAttribute("fill", randomColor);
      }
      else if (this.params.colorType === 'palette') {
        const palette = this.params.palette || [this.params.defaultColor]; // Fallback color if palette not provided
        const randomColor = palette[Math.floor(Math.random() * palette.length)];
        //path.setAttribute("data-original-color", randomColor);
        path.setAttribute("fill", randomColor);
      }
      else if (this.params.colorType === 'map') {
        const color = this.params.mapColors[country.name] || this.params.defaultColor;
        //path.setAttribute("data-original-color", randomColor);
        path.setAttribute("fill", color);
      }
      svg.appendChild(path);
    }
    this.container.appendChild(svg);

  }

  private generateCoordsObj() {
    const countries = [...this.countryData];
    for (let i = 0; i < countries.length; i++) {
      const country = countries[i];
      // Ensure each country has a name and path
      if (!country.name || !country.path) {
        //console.warn(`Country data missing name or path:`, country);
        continue;
      }
      if (country.lat && country.lon) {
        this.countryCoordsObj[country.name] = {
          x: country.x,
          lat: country.lat,
          lon: country.lon,
          i: i
        };
      }
    }
  }

  /**GLOBE IINITIALAZATION ***************************************************************/

  private init() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(this.params.fogColor, 0, this.params.fogDistance);

    // this.scene.background = new THREE.Color('red');
    // this.scene.backgroundBlurriness = 4;

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
    this.canvas = this.container.querySelector("canvas")!;
    this.svgMap = document.querySelector(`#${this.mapDomId}`)!;
    this.svgCountries = Array.from(this.svgMap.querySelectorAll("path"));
    this.countryHighlightEl = this.container.querySelector(".country")!;
    this.countryNameEl = this.container.querySelector(".info span");
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
    this.controls.maxPolarAngle = 2 * Math.PI;          // Bottom

    // Set zoom constraints (add these lines)
    this.controls.minZoom = this.params.minZoom || 0.5; // Minimum zoom level            
    this.controls.maxZoom = this.params.maxZoom || 1.5; // Maximum zoom level

    if (this.params.autoRotate) {
      this.controls.autoRotate = this.params.autoRotate || false;
      this.controls.autoRotateSpeed = this.params.autoRotateSpeed || 1.2;
      this.dynamicRender = this.controls.update.bind(this.controls);
    }

    // On user interaction start (e.g. drag)
    this.controls.addEventListener("start", () => {
      this.isHoverable = false;                    // Disable hover effects while interacting
      this.pointer = new THREE.Vector2(-2, -2);    // Move pointer off-screen to avoid accidental detection
      // Slightly shrink globe for interaction feedback
      const s = this.params.clickScale;
      gsap.to(this.globeGroup.scale, { duration: 0.3, x: s, y: s, z: s });
    });

    // On user interaction end (e.g. release)
    this.controls.addEventListener("end", () => {
      // Restore globe scale with bounce effect
      gsap.to(this.globeGroup.scale, {
        duration: 0.6,
        x: 1,
        y: 1,
        z: 1,
        ease: "back(1.7).out",
        onComplete: () => {
          this.isHoverable = true;
          //this.controls.rotateSpeed = this.getRotateSpeedFromZoom(this.camera.zoom);
          //this.controls.update();
        },
      });
    });


  }

  private createGlobe() {
    // Create base geometry for the globe — using an icosahedron for a smooth sphere
    const geometry = new THREE.IcosahedronGeometry(1, 20);

    // Sea background — slightly larger sphere rendered inside-out when transparent
    const seaRadius = this.params.seaTransparent ? 1.01 : .99
    const seaGeometry = new THREE.IcosahedronGeometry(seaRadius, 20); // Slightly larger to avoid z-fighting when transparent
    const seaMaterial = new THREE.MeshBasicMaterial({
      color: this.params.seaColor,              // Ocean blue color
      transparent: true,
      side: this.params.seaTransparent ? THREE.BackSide : THREE.FrontSide         // Render inside of the sphere
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

  private addListener<T extends Event>(
    element: EventTarget,
    type: string,
    handler: (event: T) => void,
    options?: AddEventListenerOptions
  ): void {
    const wrappedHandler = (event: Event) => handler(event as T);
    element.addEventListener(type, wrappedHandler, options);
    this.listeners.push({
      element,
      type,
      handler: wrappedHandler,
      options
    });
  }

  private addEventListeners() {
    // Update canvas size on window resize to maintain correct aspect ratio
    this.addListener(window, "resize", () => this.updateSize());

    // Track mouse movement to update pointer position for hover detection
    this.addListener(this.container, "mousemove", (e: MouseEvent) => this.updatePointer(e.clientX, e.clientY));

    // On touch interaction, mark the device as touch-enabled
    this.addListener(this.container, "touchstart", () => {
      this.isTouchScreen = true;
    });

    let path: any;
    let idx: any;
    let name: any;

    // Handle clicks on the globe to select countries
    this.addListener(this.container, "click", (e: MouseEvent) => {

      // Update pointer for raycasting
      this.updatePointer(e.clientX, e.clientY);

      // Set up raycaster to detect intersections with the globe
      this.rayCaster.setFromCamera(this.pointer, this.camera);
      const intersects = this.rayCaster.intersectObject(this.globeStrokesMesh);

      if (intersects.length) {
        // Convert UV coordinates into country index
        const uv = intersects[0].uv;
        idx = this.detectCountryFromUV(uv);

        if (idx !== null) {
          this.hoveredCountryIdx = idx;
          // Display the name of the clicked country
          path = this.svgCountries[idx];
          name = path.getAttribute("data-name") ?? "";

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
          // This should be done from the displatch
          this.setMapTexture(
            this.globeSelectionOuterMesh.material as SetMapTextureMaterial,
            this.dataUris[idx]
          );

          // Optional debug logging for lat/lon the camera is facing
          //this.logCameraDirectionAsLatLon();
          const intersectPoint = intersects[0].point;
          this.logGlobeCoords(intersectPoint, name);
        }
      }
    });

    this.addListener(this.container, "dblclick", (e: MouseEvent) => {
      // Dispatch a custom event
      this.container.dispatchEvent(new CustomEvent("countrydblClick", {
        detail: {
          name,
          index: idx,
          path,
        },
        bubbles: true, // optional, allows the event to bubble up
      }));
      //console.log(name, idx, path)
    });

  }

  private removeAllListeners(): void {
    this.listeners.forEach(({ element, type, handler, options }) => {
      element.removeEventListener(type, handler, options);
    });
    this.listeners = [];
  }

  private logGlobeCoords(point: THREE.Vector3, name: string) {
    // Convert 3D point to spherical coordinates
    const spherical = new THREE.Spherical();
    spherical.setFromVector3(point.clone().normalize());

    // Convert to latitude/longitude (in degrees)
    const lat = 90 - THREE.MathUtils.radToDeg(spherical.phi);
    const lon = THREE.MathUtils.radToDeg(spherical.theta);

    // Adjust longitude to -180 to 180 range
    const normalizedLon = lon - 266.5 < 0 ? (lon - 266.6) + 360 : lon;

    //console.log(`"lat": ${(lat + 12.5).toFixed(2)}, "lon": ${normalizedLon.toFixed(2)}`);

    // const camPos = this.camera.position.clone();
    // const spherical = new THREE.Spherical().setFromVector3(camPos);
    // arr.push({phi:spherical.phi, theta:spherical.theta})
    // console.log('spherical', arr)

  }

  /** TEXTURES ***************************************************************/

  private setMapTexture(material: SetMapTextureMaterial, URI: string) {
    if (material.map) material.map.dispose(); // Add before loading new texture
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

  /** EVENT RELATED ***************************************************************/

  private getRotateSpeedFromZoom(zoom: number): number {
    // Customize this formula as you like — lower zoom = slower rotation
    return 1 + (zoom - 1) * .1; // Example: zoom 1 → speed 1, zoom 1.5 → speed 2
  }

  public setGlobeCountryColor(name: string, newColor: string): void {
    // 1 Find and update the live SVG path
    const path = this.svgCountries.find(p => p.getAttribute('data-name') === name);
    if (!path) {
      console.warn(`Country "${name}" not found.`);
      return;
    }
    path.setAttribute('fill', newColor);

    // 2 Re‑generate all three textures from the mutated SVG
    this.updateBaseTexture();
    this.updateStrokeTexture();
    this.updateSelectionTexture();

    // 3 Force Three.js to refresh each of the maps & materials
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
    //console.time('render')

    // If i want auto rotation
    //this.controls.update()

    this.dynamicRender()

    // Handle hover interaction only if allowed
    let frameCount = 0;
    if (this.isHoverable && frameCount++ % 3 === 0) {
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
            this.countryNameEl.innerHTML = name || "";
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
    this.obj.points?.forEach((item: any) => item.updateVisibility());
    this.obj.pulsingPoints?.forEach((p: any) => p.animation.update());
    // Disable hover if device is touch-based
    if (this.isTouchScreen && this.isHoverable) this.isHoverable = false;
    // Final render
    this.renderer.render(this.scene, this.camera);


    this.obj.shapeUpdates?.forEach((shape: THREE.Object3D) => {
      if (shape.userData['updateVisibility']) {
        shape.userData['updateVisibility']();
      }
    });

    //console.timeEnd('render')
  };

  private logCameraDirectionAsLatLon() {
    const cameraToGlobe = new THREE.Vector3()
      .subVectors(this.globeGroup.position, this.camera.position)
      .normalize(); // From camera to center of globe

    const lat = THREE.MathUtils.radToDeg(Math.asin(cameraToGlobe.y));
    const lon = THREE.MathUtils.radToDeg(Math.atan2(cameraToGlobe.x, cameraToGlobe.z));

    const countryElement = this.svgCountries[this.hoveredCountryIdx];
    const countryName = countryElement?.getAttribute("data-name");

    //console.log(`,"x": ${Number(lat.toFixed(2))}, "y": ${Number(lon.toFixed(2))}`);

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
    //console.log(this.obj);

    // console.log(this.globeGroup)
    // console.log(this.globeGroup.quaternion)

  }

  /** STILL TESTING ***************************************************************/

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
        lon: coords.lon + 86.5
      });

      this.setMapTexture(
        this.globeSelectionOuterMesh.material as SetMapTextureMaterial,
        this.dataUris[coords.i]
      );

      if (this.countryNameEl) {
        this.countryNameEl.innerHTML = name || "";
      }
    }
  }

  /** TODO ***************************************************************/

  public clearSelection() {
    this.hoveredCountryIdx = -1;
    //(this.globeSelectionOuterMesh.material as SetMapTextureMaterial).map = null;
    // (this.globeSelectionOuterMesh.material as SetMapTextureMaterial).needsUpdate = true;
  }

  public destroy() {
    // Remove GSAP animations
    gsap.ticker.remove(this.render);
    this.obj.pulsingPoints?.forEach((p: any) => {
      gsap.ticker.remove(p.animation.update);
    });

    // Dispose Three.js resources
    this.controls?.dispose();
    this.renderer?.dispose();

    // Dispose geometries and materials
    this.scene.traverse(obj => {
      if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
      if ((obj as THREE.Mesh).material) {
        const mat = (obj as THREE.Mesh).material;
        if (Array.isArray(mat)) mat.forEach(m => m.dispose());
        else mat.dispose();
      }
    });

    this.removeAllListeners();
    this.container.innerHTML = '';

    this.globeGroup = new THREE.Group();
    this.obj = {
      points: [],
      pulsingPoints: [],
      countryAnimations: {}
    };

    // Reset DOM references
    this.canvas = null!;
    this.svgMap = null!;
    this.svgCountries = [];

  }

  public refresh(params: GlobeParams) {
    this.destroy();

    // Reinitialize with new parameters
    this.create(params);
  }

  /**ZOOM **********************/

  public animateZoom(targetZoom: number, duration: number = 1): void {
    if (this.camera instanceof THREE.OrthographicCamera) {
      gsap.to(this.camera, {
        zoom: targetZoom,
        duration,
        ease: "power2.inOut",
        onUpdate: () => {
          this.camera.updateProjectionMatrix();
          this.controls.update();
          this.render();
        },
        onComplete: () => {
          this.controls.update();
        }
      });
    }
    else {
      gsap.to(this.controls, {
        minDistance: targetZoom,
        maxDistance: targetZoom,
        duration,
        ease: "power2.inOut",
        onUpdate: () => {
          this.controls.update();
          this.render();
        }
      });
    }
  }

  public zoomToCountry(countryName: string, zoomLevel: number = 5, duration: number = 1.5): void {
    if (this.countryCoordsObj[countryName]) {
      const coords = this.countryCoordsObj[countryName];
      this.focusLatLon({ lat: coords.x, lon: coords.lon + 86.5 });
      this.animateZoom(zoomLevel, duration);
    }
  }

  /** POINT WITH LABEL ***************************************************************/

  private createTextSprite({
    text,
    color = '#ffffff',
    fontSize = 64
  }: {
    text: string;
    color?: string;
    fontSize?: number;
  }): THREE.Sprite {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 256;

    if (context) {
      context.fillStyle = 'rgba(0, 0, 0, 0.7)';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.font = `Bold ${fontSize}px Arial`;
      context.fillStyle = color;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(text, canvas.width / 2, canvas.height / 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.9
    });

    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.2, 0.1, 1);
    sprite.center.set(0.5, 0);
    sprite.renderOrder = 999;

    return sprite;
  }

  public addLabeledPoint({
    coords,
    color = '#ff0000',
    labelText = '',
    size = 0.005
  }: {
    coords: { x: number, y: number };
    color?: string;
    labelText?: string;
    size?: number;
  }): THREE.Mesh {
    const position = this.customToPosition(coords);

    const point = new THREE.Mesh(
      new THREE.SphereGeometry(size, 16, 16),
      new THREE.MeshBasicMaterial({
        color,
        depthTest: true,
        transparent: true,
        opacity: 0.9
      })
    );
    point.position.copy(position);
    this.globeGroup.add(point);

    if (labelText) {
      const label = this.createTextSprite({ text: labelText, color });
      const labelWrapper = new THREE.Object3D();
      labelWrapper.add(label);
      labelWrapper.position.copy(position);
      label.position.y = size * 4;

      this.scene.add(labelWrapper);
      labelWrapper.visible = false;

      this.obj.points.push({
        point,
        label: labelWrapper,
        updateVisibility: () => {
          const cameraToPoint = new THREE.Vector3()
            .subVectors(point.position, this.camera.position)
            .normalize();

          const pointNormal = point.position.clone().normalize();

          labelWrapper.visible = cameraToPoint.dot(pointNormal) < 0.4;

          if (labelWrapper.visible) {
            labelWrapper.quaternion.copy(this.camera.quaternion);
          }
        }
      });
    }

    return point;
  }

  public addLabeledPointToCountry({
    name,
    color = '#ff0000',
    labelText = '',
    size = 0.005
  }: {
    name: string;
    color?: string;
    labelText?: string;
    size?: number;
  }) {
    const c = this.countryCoordsObj[name];
    const label = labelText || name;
    const coords = { x: c.lat, y: c.lon };
    this.addLabeledPoint({
      coords: coords, color: color, labelText: label, size: size
    })
  }

  public removeLabeledPoint(index: number): void {
    if (!this.obj.points || index < 0 || index >= this.obj.points.length) {
      return;
    }

    const entry = this.obj.points[index];
    const { point, label } = entry;

    // 1 Remove point mesh from globe
    this.globeGroup.remove(point);

    // 2 Dispose point geometry & material
    if ((point as THREE.Mesh).geometry) {
      (point as THREE.Mesh).geometry.dispose();
    }
    const pointMat = (point as THREE.Mesh).material;
    if (Array.isArray(pointMat)) {
      pointMat.forEach(m => m.dispose());
    } else {
      pointMat.dispose();
    }

    // 3 Remove label wrapper from scene
    this.scene.remove(label);

    // 4 Dispose label’s texture & material
    const sprite = label.children[0] as THREE.Sprite;
    const spriteMat = (sprite.material as THREE.SpriteMaterial);
    if (spriteMat.map) {
      spriteMat.map.dispose();
    }
    spriteMat.dispose();

    // 5 Remove from your internal array so updateVisibility no longer runs
    this.obj.points.splice(index, 1);
  }

  /** PULSING POINT ********************************************************************/

  public addPulsingPoint(
    coords: { x: number, y: number },
    color: string = '#ff0000',
    size: number = 0.15,
    pulseConfig: {
      speed?: number,
      minSize?: number,
      maxSize?: number,
      hideWhenBackface?: boolean // New option
    } = {}
  ): THREE.Mesh {
    const position = this.customToPosition(coords);

    // Default pulse configuration
    const config = {
      speed: 1.5,
      minSize: size * 0.8,
      maxSize: size * 1.5,
      hideWhenBackface: true, // Default to hiding backface points
      ...pulseConfig
    };

    // Create point geometry
    const geometry = new THREE.SphereGeometry(size, 16, 16);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9
    });

    const point = new THREE.Mesh(geometry, material);
    point.position.copy(position);
    this.globeGroup.add(point);

    // Create pulse animation
    const pulseAnimation = {
      progress: 0,
      update: () => {
        pulseAnimation.progress += 0.01 * config.speed;
        const scale = config.minSize +
          (Math.sin(pulseAnimation.progress) * 0.5 + 0.5) *
          (config.maxSize - config.minSize);
        point.scale.set(scale, scale, scale);

        // Backface visibility control
        if (config.hideWhenBackface) {
          const cameraToPoint = new THREE.Vector3()
            .subVectors(point.position, this.camera.position)
            .normalize();
          const pointNormal = point.position.clone().normalize();
          point.visible = cameraToPoint.dot(pointNormal) < 0.4;
        }
      }
    };

    // Add to animation loop
    gsap.ticker.add(pulseAnimation.update);

    this.obj.pulsingPoints.push({
      point,
      animation: pulseAnimation,
      config
    });

    return point;
  }

  public removePulsingPoint(index: number): void {
    // 1) Bounds check
    if (!this.obj.pulsingPoints || index < 0 || index >= this.obj.pulsingPoints.length) {
      return;
    }

    // 2) Grab the entry
    const entry = this.obj.pulsingPoints[index];
    const { point, animation } = entry;

    // 3) Remove the animation from GSAP ticker
    gsap.ticker.remove(animation.update);

    // 4) Remove the mesh from the scene
    this.globeGroup.remove(point);

    // 5) Dispose of geometry
    if (point.geometry) {
      point.geometry.dispose();
    }

    // 6) Dispose of material
    const mat = point.material;
    if (Array.isArray(mat)) {
      mat.forEach(m => m.dispose());
    } else {
      mat.dispose();
    }

    // 7) Finally, remove the entry from your tracking array
    this.obj.pulsingPoints.splice(index, 1);
  }

  /** FLIGHT PATH WITH PULSE ANIMATION ***************************************************************/

  public addFlightPath(
    startPoint: { x: number, y: number },
    endPoint: { x: number, y: number },
    color: string = '#ffffff',
    options: {
      thickness?: number,
      altitude?: number,
      dashLength?: number,
      animationSpeed?: number,
      pulseSize?: number
    } = {}
  ): void {
    // Merge with defaults
    const config = {
      thickness: 0.003,
      altitude: 0.2, // How high the arc goes (0-1)
      dashLength: 0.02,
      animationSpeed: 1,
      pulseSize: 0.03,
      ...options
    };

    // Convert your custom coordinates to 3D positions
    const startPos = this.customToPosition(startPoint).normalize();
    const endPos = this.customToPosition(endPoint).normalize();

    // Create the flight path curve
    const curve = this.createFlightCurve(startPos, endPos, config.altitude);
    const tubeGeometry = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(curve.points),
      64,
      config.thickness,
      8,
      false
    );

    // Create dashed line material
    const pathMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.8
    });

    const pathMesh = new THREE.Mesh(tubeGeometry, pathMaterial);
    this.globeGroup.add(pathMesh);

    // Add animated pulse
    const pulse = this.createPulse(startPos, color, config.pulseSize);
    this.animatePulseAlongCurve(pulse, curve.points, config.animationSpeed);

    // Store references
    if (!this.obj.flightPaths) this.obj.flightPaths = [];
    this.obj.flightPaths.push({ path: pathMesh, pulse });
  }

  public addFlightPathBetweenCountries(
    startCountry: string,
    endCountry: string,
    color: string = '#ffffff',
    options: {
      thickness?: number,
      altitude?: number,
      dashLength?: number,
      animationSpeed?: number,
      pulseSize?: number
    } = {}
  ) {
    const c1 = this.countryCoordsObj[startCountry];
    const c2 = this.countryCoordsObj[endCountry];
    const p1 = { x: c1.lat, y: c1.lon };
    const p2 = { x: c2.lat, y: c2.lon };
    this.addFlightPath(p1, p2, color, options);
  }

  private createFlightCurve(
    start: THREE.Vector3,
    end: THREE.Vector3,
    altitude: number
  ): { points: THREE.Vector3[]; length: number } {
    const points: THREE.Vector3[] = [];
    const normal = new THREE.Vector3().crossVectors(start, end).normalize();
    const angle = start.angleTo(end);
    const segments = 32;

    // Create a higher arc for longer distances
    const dynamicAltitude = altitude * Math.min(1, angle / Math.PI * 2);

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const theta = angle * t;

      // Calculate position along great circle
      const q = new THREE.Quaternion();
      q.setFromAxisAngle(normal, theta);
      const basePos = start.clone().applyQuaternion(q);

      // Add altitude to create arc
      const up = basePos.clone().normalize();
      const arcHeight = Math.sin(Math.PI * t) * dynamicAltitude;
      const arcPos = basePos.add(up.multiplyScalar(arcHeight));

      points.push(arcPos.normalize().multiplyScalar(1.02)); // Slightly above surface
    }

    return { points, length: angle };
  }

  private createPulse(position: THREE.Vector3, color: string, size: number): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(size, 16, 16);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9
    });
    const pulse = new THREE.Mesh(geometry, material);
    pulse.position.copy(position);
    this.globeGroup.add(pulse);
    return pulse;
  }

  private animatePulseAlongCurve(
    pulse: THREE.Mesh,
    points: THREE.Vector3[],
    speed: number
  ): void {
    const duration = points.length / (speed * 10);
    let progress = 0;

    const animate = () => {
      progress = (progress + 0.005) % 1;
      const index = Math.floor(progress * (points.length - 1));
      pulse.position.copy(points[index]);
      pulse.scale.setScalar(1 + Math.sin(progress * Math.PI * 2) * 0.3);
      requestAnimationFrame(animate);
    };

    animate();
  }

  private customToPosition(point: { x: number, y: number }, radius: number = 1.01): THREE.Vector3 {
    // 1. Convert your coordinates to standard lat/lon
    const lat = point.x - 12.5;   // Reverse your -11 adjustment
    const lon = point.y + 266.5;    // Reverse your +268 adjustment

    // 3. Convert to spherical coordinates (radians)
    const phi = THREE.MathUtils.degToRad(90 - lat);  // Co-latitude
    const theta = THREE.MathUtils.degToRad(lon);

    // 4. Convert to 3D Cartesian coordinates
    const position = new THREE.Vector3();
    position.setFromSphericalCoords(radius, phi, theta);

    return position;
  }

  public removeFlightPath(index: number): void {

    const { path, pulse } = this.obj.flightPaths[index];

    // Remove from the scene
    this.globeGroup.remove(path);
    this.globeGroup.remove(pulse);

    // Dispose geometry and materials to free memory
    if (path.geometry) path.geometry.dispose();
    if (Array.isArray(path.material)) {
      path.material.forEach((m: any) => m.dispose());
    } else if (path.material) {
      path.material.dispose();
    }

    if (pulse.geometry) pulse.geometry.dispose();
    if (Array.isArray(pulse.material)) {
      pulse.material.forEach((m: any) => m.dispose());
    } else if (pulse.material) {
      pulse.material.dispose();
    }

    // Remove from internal tracking
    this.obj.flightPaths.splice(index, 1);
  }


}