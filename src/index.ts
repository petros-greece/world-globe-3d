import { GlobeParams, default as InteractiveGlobe } from "./InteractiveGlobe";

/** CREATE THE GLOBE ******************************** */

let globe = new InteractiveGlobe(".globe-wrapper");

const globeParams: GlobeParams = {
	infoPositionX: "center",
	infoPositionY: "start",
	colorType: "random", // 'random' | 'palette' | 'map'
	palette: [
		'#FF6B6B',
		'#4ECDC4',
	],
	strokeColor: "#111111",
	defaultColor: "#9a9591",
	hoverColor: "#000000",
	fogColor: "#2196f3",
	fogDistance: 2.6,
	strokeWidth: 2,
	hiResScalingFactor: 2,
	lowResScalingFactor: 0.7,
	padding: 50,
	minZoom: 0.5,
	maxZoom: 20,
	seaColor: 'red',
	seaTransparent: false,
	autoRotate: false,
	autoRotateSpeed: 1.2,
	clickScale: 1,
}

globe.create(globeParams)

globe.container.addEventListener("countryClick", (e: Event) => {
	const event = e as CustomEvent;
	console.log("Clicked country:", event.detail.name, event.detail.idx);
});

globe.container.addEventListener("countrydblClick", (e: Event) => {
	const event = e as CustomEvent;
	console.log("Clicked double click country:", event.detail);
});

// globe.addPulsingPoint({ x: 0, y: 0 }, '#ff0000');
// globe.focusOnCountry('Australia');

// globe.addLabeledPoint({
// 	coords: { x: -33.2, y: -221.62 },
// 	color: '#ff5733',
// 	labelText: `Australia`
// });

// setTimeout(()=>{

// 	globe.removeLabeledPoint(0)
// }, 2000)

// globe.addLabeledPointToCountry({
// 	name: 'Australia'
// })

// globe.setGlobeCountryColor("Russia", "red");
// globe.addFlightPathBetweenCountries('Greece', 'Canada', '#ff0000')
// globe.destroy()
// await globe.refresh({ seaColor: 'green' });


/** LABELED POINTS ******************************** */

const showPoints = false;

if (showPoints) {

	for (let i = 0; i < 360; i += 30) {
		for (let j = 0; j < 360; j += 30) {
			globe.addLabeledPoint({
				coords: { x: j, y: i },
				labelText: `${j} ${i}`
			});
		}
	}

}

/** FOCUS ON ALL COUNTRIES ******************************** */

const focusOnAllCountries = false;

if (focusOnAllCountries) {
    let ii = 0;
    let prevName = '';
    const countryNames = Object.keys(globe.countryCoordsObj);
    
    function processCountry(index: number) {
        if (index >= countryNames.length) return;
        
        const countryName = countryNames[index];
        const coords = globe.countryCoordsObj[countryName];
        
        globe.focusOnCountry(countryName);
        
        // Add new point
        globe.addLabeledPoint({
            coords: { x: coords.lat, y: coords.lon },
            color: '#ff5733',
            labelText: `${countryName.slice(0, 3)}`
        });
        
        // Optional: Add flight path
        if (prevName) {
            globe.addFlightPathBetweenCountries(prevName, countryName, '#ff0000');
        }
                // Remove previous point (if not first iteration)
        if (index > 1) {
            globe.removeLabeledPoint(0);
						globe.removeFlightPath(0)
        }
        prevName = countryName;
        
        // Process next country after delay
        setTimeout(() => processCountry(index + 1), 2000);
    }
    
    // Start processing
    processCountry(0);
}

/**COLOR COUNTRIES ******************************************************************** */

const colorCountries = false;

if (colorCountries) {
	globe.setGlobeCountryColor("Russia", "red");
	globe.setGlobeCountryColor("Greece", "red");
}

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