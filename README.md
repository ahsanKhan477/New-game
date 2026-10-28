# Road Fighter 
 
A classic arcade-style road racing game built with HTML5 Canvas, CSS3, and vanilla JavaScript. 
 
## Run Locally 
Simply open index.html in any modern browser - no build step required. 
 
## Features 
- Mobile-first responsive fullscreen canvas 
- Touch drag and keyboard steering (arrow keys or A/D) 
- Traffic spawning with relative speed, fuel pickups, and collision detection 
- Score progression, persistent high score via localStorage 
- Synthesized audio via the Web Audio API - no external files 
 
## Files 
- index.html - Game structure, HUD, and overlay screens 
- style.css - Responsive layout, HUD styling, and mobile controls 
- game.js - Game loop, rendering, input, and collision logic 
 
## Android APK Preparation (Capacitor) 
This project is structured for direct Capacitor packaging. 
1. Install Node.js and Capacitor CLI: npm install -g @capacitor/cli 
2. Initialize: npx cap init "Road Fighter" com.ahsan.roadfighter --web-dir=. 
3. Add Android platform: npx cap add android 
4. Open in Android Studio: npx cap open android 
5. Build the APK from Android Studio as usual. 
 
## License 
Free for personal and educational use. 
