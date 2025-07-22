# world-globe-3d

A world globe graphical UI to build upon based on three.js

## 🚀 Demo

👉 [Live Interactive Globe Demo](https://siteland.eu/tools/interactive-globe/)  
Explore the interactive 3D globe in action.

## USAGE EXAMPLES

```ts

import { GlobeParams, InteractiveGlobe } from "./InteractiveGlobe";

/** 🌐 CREATE AND CONFIGURE THE GLOBE ****************************/

// Instantiate the globe inside a DOM container
let globe = new InteractiveGlobe(".globe-wrapper");

// Set configuration parameters for appearance and behavior
const globeParams: GlobeParams = {
	infoPositionX: "center",         // Horizontal position of info label
	infoPositionY: "start",          // Vertical position of info label
	colorType: "random",             // Options: 'random', 'palette', 'map'
	palette: ['#FF6B6B', '#4ECDC4'], // Used if colorType is 'palette'
	strokeColor: "#111111",          // Country border color
	defaultColor: "#9a9591",         // Default fill color
	hoverColor: "#000000",           // Color on hover
	fogColor: "#2196f3",             // Scene fog color
	fogDistance: 2.6,                // Fog intensity/distance
	strokeWidth: 2,                  // Border thickness
	hiResScalingFactor: 2,           // Scale multiplier for high-res rendering
	lowResScalingFactor: 0.7,        // Scale multiplier for low-res
	padding: 50,                     // Globe padding
	minZoom: 0.5,                    // Minimum zoom level
	maxZoom: 20,                     // Maximum zoom level
	seaColor: 'red',                 // Background (sea) color
	seaTransparent: false,          // If true, sea will be transparent
	autoRotate: false,               // Auto-rotation toggle
	autoRotateSpeed: 1.2,            // Speed of auto-rotation
	clickScale: 1,                   // Scale effect on click
};

// Initialize the globe with parameters
await globe.create(globeParams);

/** 🖱 COUNTRY INTERACTION EVENTS ******************************/

// Handle single click on a country
globe.container.addEventListener("countryClick", (e: Event) => {
	const event = e as CustomEvent;
	console.log("Clicked country:", event.detail.name, event.detail.index);
});

// Handle double click on a country
globe.container.addEventListener("countrydblClick", (e: Event) => {
	const event = e as CustomEvent;
	console.log("Clicked double click country:", event.detail.name, event.detail.index);
});

/** 🛫 OPTIONAL FLIGHT PATHS DEMO ******************************/

const showFlightPaths = false;

if (showFlightPaths) {
	// Add animated flight paths between countries
	globe.addFlightPathBetweenCountries('Greece', 'Brazil', '#ff0000');
	globe.addFlightPathBetweenCountries('Brazil', 'United States', '#ff0000');

	// Example: batch add custom flight paths with animation
	// const routes = [...];
	// routes.forEach(route => {
	//   globe.addFlightPath(...);
	// });
}

/** 📍 OPTIONAL LABELED POINTS DEMO ****************************/

const showPoints = false;

if (showPoints) {
	// Add labeled grid points every 30 degrees
	for (let i = 0; i < 360; i += 30) {
		for (let j = 0; j < 360; j += 30) {
			globe.addLabeledPoint({
				coords: { x: j, y: i },
				labelText: `${j} ${i}`
			});
		}
	}
}

/** 🔍 ZOOM AND FOCUS ON COUNTRIES *****************************/

const focusOnAllCountries = false;

if (focusOnAllCountries) {
	let ii = 0;
	let prevNAme = '';

	for (let countryName in globe.countryCameraCoordsObj) {
		setTimeout(() => {
			let coords = globe.countryCameraCoordsObj[countryName];

			// Zoom into the country
			globe.zoomToCountry(countryName, Math.ceil(Math.random() * 6));

			// Add labeled point on the country
			globe.addLabeledPoint({
				coords: { x: coords.lat, y: coords.lon },
				color: '#ff5733',
				labelText: `${countryName.slice(0, 3)}`
			});

			prevNAme = countryName;
		}, 2000 * ii);
		ii += 1;
	}
}

/** 🎨 COLOR SPECIFIC COUNTRIES *******************************/

const colorCountries = false;

if (colorCountries) {
	globe.setGlobeCountryColor("Russia", "red");
	globe.setGlobeCountryColor("Greece", "red");
}

/** 🔧 DEV NOTES ***********************************************

// Uncomment to test other features:
// globe.addPulsingPoint({ x: 0, y: 0 }, '#ff0000');
// globe.focusOnCountry('Greece');
// globe.setGlobeCountryColor("Russia", "red");
// globe.addFlightPathBetweenCountries('Greece', 'Canada', '#ff0000');
// await globe.refresh({ seaColor: 'green' });
// globe.destroy();

*/

#TODO

1. Find more accurate svg to align the coords with the real world coords