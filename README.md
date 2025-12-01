# 🪐 Central Gravitational Field – Orbit Simulation

### Inspired by NASA’s DART mission & real orbital mechanics

In September 2022, NASA’s **DART mission** (Double Asteroid Redirection Test) became humanity’s first attempt to deliberately alter the orbit of a celestial body.
By impacting the asteroid **Dimorphos**, DART demonstrated that **kinetic impactors** can change an orbit’s period and shape — a milestone for **planetary defense**.

This simulation draws inspiration from that mission: it models how a small body *m* evolves under the gravitational pull of a massive body *M*, how orbital trajectories respond to changes in velocity, and how quantities such as energy, eccentricity, and brightness vary over time.
Although not a physical DART reconstruction, the project provides an educational sandbox to explore the mechanics behind **orbital deflection** and classical Newtonian motion.

---

## 🚀 Features

### 🟣 Orbital Mechanics

* Numerical integration of 2-body motion (central gravitational field, M ≫ m)
* Automatic orbit classification:

  * **Elliptical**
  * **Circular**
  * **Parabolic**
  * **Hyperbolic**
  * **Impact / Collision**
* Displays:

  * Position and velocity
  * Specific mechanical energy **E**
  * Eccentricity **e**
  * Orbital period **T** (where applicable)
  * Time since start **t**

### 🎨 Graphics & Visualization

* Real-time orbital trail
* Optional **body images** or point-mass mode
* Adjustable **starfield background** with dynamic fading
* Velocity vector
* Auto-scaling and auto-fit of the view

### 📊 Real-Time Charts (Apache ECharts)

* Energy components `E`, `K`, `U`
* Distance `r(t)`
* Speed `u(t)`
* Brightness / flux `L(t)`
* Sliding time window and point trimming for performance

### 🌐 Multilingual UI

* Fully dynamic **i18n system** (English / Ελληνικά)
* Language switcher (labels always shown as “English” and “Ελληνικά”)

### ⏯ Playback & Interaction

* Play / Pause / Reset
* Manual pan and zoom
* Configurable options:

  * Initial radius
  * Initial speed
  * Impact simulation toggle
  * Show / hide images
  * Show / hide starfield
  * Show / hide trail

### ⚙️ Performance Enhancements

* Automatic **pause when the browser tab loses focus**
* Sliding-window trimming of chart history
* Controlled sampling and redraw frequency
* Efficient HTML5 canvas rendering

---

## 📁 Project Structure

```text
.
├── index.html          # Main HTML interface
├── config.js           # Global constants and settings
├── main.js             # Main loop, lifecycle, event binding
├── physics.js          # Physics engine (integration, energies, orbit type)
├── orbitControl.js     # Pan/zoom and viewport logic
├── draw.js             # Canvas rendering (grid, bodies, trajectory)
├── ui.js               # Sliders, toggles, UI logic
├── charts.js           # ECharts plotting engine
├── i18n.js             # Translation engine
└── i18n.json           # Localization file (EN/EL)
```

---

## 🧪 Physics Model

The simulation uses Newton’s law of gravitation:

```math
\vec{a} = - \frac{GM}{r^3}\,\vec{r}
```

It computes in real time:

- **Specific mechanical energy**

```math
E = \frac{u^2}{2} - \frac{GM}{r}
```

- **Eccentricity**

```math
e = \sqrt{\,1 + \frac{2EL^2}{(GM)^2}\,}
```

- **Orbit type classification** based on **E** and **e**

The numerical integrator ensures stable behaviour for a wide range of orbital conditions, including open trajectories (parabolic/hyperbolic), closed elliptical orbits, and impacts.


---

## 🛠 Technologies Used

* **HTML5 Canvas**
* **Modern JavaScript (ES Modules)**
* **Apache ECharts** for dynamic charts
* **Vanilla CSS**
* Custom **i18n** implementation for multilingual UI

---

## 🧩 How to Run

No installation is required beyond a modern browser.

### Option 1 — Open directly

Open https://paulgai.github.io/DART-Mission-Simulation/ in a modern browser (Chrome recommended).
For some browsers, a local server is still preferable due to ES module loading.

### Option 2 — Local web server (recommended)

Because ES modules work best from a server, you can use for example:

```bash
# Python
python3 -m http.server

# Node (serve)
npx serve
```

Then visit:

`http://localhost:8000`
(or whatever port your server uses).

---

## 📌 Roadmap / Planned Improvements

* Alternate UI themes (dark mode, high-contrast)
* Optional analytical Keplerian overlay
* Export trajectory data to CSV
* GIF / MP4 recording of the simulation
* Additional diagram options (e.g. angular momentum, acceleration)

---

## 🤝 Contributing

Contributions are welcome!
If you find a bug or have an idea for an improvement, feel free to:

* Open an **issue**
* Submit a **pull request**

---

## 📄 License

**MIT License**
You are free to use, modify, and distribute this project under the terms of the MIT license.
