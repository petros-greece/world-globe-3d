import { GlobeParams, InteractiveGlobe } from "./InteractiveGlobe";

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
	console.log("Clicked country:", event.detail.name, event.detail.index);
});


globe.container.addEventListener("countrydblClick", (e: Event) => {
	const event = e as CustomEvent;
	console.log("Clicked double click country:", event.detail.name, event.detail.index);
});

// globe.addPulsingPoint({ x: 0, y: 0 }, '#ff0000');
// globe.focusOnCountry('Greece');
// globe.setGlobeCountryColor("Russia", "red");
// globe.addFlightPathBetweenCountries('Greece', 'Canada', '#ff0000')
// globe.destroy()
// await globe.refresh({ seaColor: 'green' });



/** FLIGHT PATHS ******************************** */

const showFlightPaths = false;

if (showFlightPaths) {

	globe.addFlightPathBetweenCountries('Greece', 'Brazil', '#ff0000')
	globe.addFlightPathBetweenCountries('Brazil', 'United States', '#ff0000')

	// Multiple flight paths
	// const routes = [
	// 	{ from: [40.7128, -74.0060], to: [51.5074, -0.1278], color: '#ff0000' }, // Rome-Tokyo
	// 	{ from: [30, 280], to: [45, 300], color: '#00ff00' },  // Rome-Moscow
	// 	{ from: [45, 300], to: [155, 220], color: '#0000ff' }  // Moscow-Tokyo
	// ];





	// routes.forEach(route => {
	// 	globe.addFlightPath(
	// 		route.from[0], route.from[1],
	// 		route.to[0], route.to[1],
	// 		route.color,
	// 		{
	// 			altitude: .9,
	// 			animationSpeed: 2,
	// 			thickness: 0.005,
	// 			pulseSize: 0.05
	// 		}
	// 	);
	// });

}

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
	let prevNAme = '';
	for (let countryName in globe.countryCameraCoordsObj) {

		setTimeout(() => {

			let jjj = globe.countryCameraCoordsObj[countryName]
			//globe.focusOnCountry(countryName);
			globe.zoomToCountry(countryName, Math.ceil(Math.random()*6))
			globe.addLabeledPoint({
				coords: { x: jjj.lat, y: jjj.lon },
				color: '#ff5733',
				labelText: `${countryName.slice(0, 3)}`
			});

			// if (prevNAme) {
			// 	globe.addFlightPathBetweenCountries(prevNAme, countryName, '#ff0000')
			// }

			prevNAme = countryName;

		}, 2000 * ii)
		ii += 1;
	}

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