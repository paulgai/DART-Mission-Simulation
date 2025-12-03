# **1. Asteroids and Planetary Defense**

Asteroids are rocky bodies that orbit the Sun, ranging in size from a few meters to hundreds of kilometers. Most of them pose no threat to Earth, yet their long-term trajectories can change due to gravitational interactions, collisions with smaller objects, or even the subtle push of sunlight (the Yarkovsky effect). For this reason, space agencies continuously track thousands of **Near-Earth Objects (NEOs)** to assess whether any of them could one day approach our planet too closely.

Although impacts large enough to cause global damage are extremely rare, even a small asteroid—tens or hundreds of meters across—can generate significant regional destruction. The 2013 Chelyabinsk meteor, only about 20 meters in diameter, produced a shockwave that shattered windows across an entire city. Events like this highlight the importance of understanding how asteroids move and how we might intervene if one were ever found on a threatening path.

This is where **planetary defense** comes in. Planetary defense refers to all scientific, technological, and international efforts aimed at detecting potentially hazardous asteroids and developing strategies to prevent a collision with Earth. These strategies can include:

* **Orbital tracking and early prediction**, using telescopes and radar
* **Modeling asteroid structure and composition**, to understand how they behave physically
* **Deflection techniques**, which attempt to slightly change an asteroid’s orbit so it no longer intersects Earth

Among the proposed deflection methods, one of the most promising—and simplest—is the **kinetic impactor**: sending a spacecraft to collide with an asteroid to gently nudge it onto a safer path. Even a very small change in speed, applied years in advance, can shift an asteroid’s trajectory enough to avoid impact.

Understanding these ideas helps students connect classroom physics—gravity, energy, motion—with real-world challenges. It also highlights why missions like NASA’s DART are not science fiction experiments, but part of a growing global effort to ensure that humanity is capable of protecting Earth from natural hazards.

---

<p align="center">
  <img src="scripts/img/asteroid.gif" alt="Asteroid animation" width="450">
  <br>
  <em>Figure 1. Mapping of Near-Earth Objects (NEOs) discovered over the past 20 years.</em>
  <br>
  <sub>Image credit: <a href="https://www.jpl.nasa.gov/news/twenty-years-of-tracking-near-earth-objects/">NASA / JPL-Caltech</a></sub>
</p>

**Description:**  
The animation depicts a mapping of the positions of known near-Earth objects (NEOs) at points in time over the past 20 years, and finishes with a map of all known asteroids as of January 2018. Asteroid search teams supported by NASA's NEO Observations Program have found over 95 percent of near-Earth asteroids currently known. There are now over 18,000 known NEOs, and the discovery rate averages about several hundred new objects per year.


# **2. The DART Mission: Why It Mattered**

In September 2022, NASA carried out a historic experiment called **DART** — the *Double Asteroid Redirection Test*. It was the first real attempt in human history to change the orbit of a celestial body on purpose. Instead of relying on computer simulations or laboratory experiments, scientists tested a full-scale planetary-defense technique in space.

### **2.1 Why Did NASA Target Dimorphos?**

DART’s target was **Dimorphos**, a small moonlet orbiting a larger asteroid named **Didymos**. This asteroid pair was carefully chosen because:

* **It posed no danger to Earth.** Any change in Dimorphos’ orbit could not redirect it toward our planet.
* **It formed a natural laboratory.** Scientists could easily measure how Dimorphos’ orbital period around Didymos changed after impact.
* **Its size was realistic.** With a diameter of ≈160 m, Dimorphos represents the kind of asteroid that could cause regional devastation if it ever collided with Earth.

This made the Didymos–Dimorphos system a perfect testing ground for a controlled deflection experiment.

### **2.2 What DART Actually Did**

The DART spacecraft did not carry explosives or special equipment. Its mission was intentionally simple:

> **Hit Dimorphos at high speed and measure how much the impact changes its orbit.**

Traveling at about **6.1 km/s**, DART crashed into Dimorphos and transferred momentum to the asteroid — the same way a cue ball transfers momentum to another ball in billiards, but on a far grander scale.

### **2.3 What Scientists Measured After the Impact**

After the collision, telescopes on Earth and in space observed:

* A large cloud of *ejecta* (material thrown off the asteroid)
* A measurable change in brightness as Dimorphos moved in front of or behind Didymos
* Most importantly, a **significant change in the asteroid’s orbital period**

Before the impact, Dimorphos orbited Didymos once every **11 hours and 55 minutes**.
After the impact, its orbit became **shorter by about 33 minutes** — far more than the minimum expected change.

This confirmed that:

1. **Kinetic impactors can successfully alter an asteroid’s orbit.**
2. Ejecta leaving the asteroid surface can enhance the momentum transfer far beyond the spacecraft’s own momentum.
3. Planetary defense is not theoretical — it is achievable with existing space technology.

### **2.4 Why Is This Important for Students?**

The DART mission brings together several key physics concepts:

* gravitational attraction in a two-body system
* orbital motion and mechanical energy
* conservation of momentum
* how small velocity changes can accumulate into large orbital shifts

It also shows students a real example of science solving a global, long-term problem.
For many, DART is the first time they encounter physics not as abstract equations, but as something that directly affects the safety of our planet.
Below is **Section 3**, written in clear English for high-school students but rigorous enough to connect directly with your simulation’s physics engine.
It is structured in four short subsections, each aligned with the concepts computed in **physics.js**, **charts.js**, and the UI.

---

# **3. The Physics Behind DART and Orbital Motion**

Understanding the DART mission—and the simulation in this project—requires a few essential physics ideas. These concepts help explain why asteroids move the way they do, how orbits are shaped, and how a small velocity change can redirect a celestial body.

---

## **3.1 Central Gravitational Field**

Every object with mass creates gravity. When one body is much more massive than another (like Didymos compared to Dimorphos), their interaction can be treated as a **central gravitational field**:

* The massive body ( M ) sits at the center.
* The smaller body ( m ) feels a force that always points toward ( M ).
* The gravitational acceleration is given by:

[
\vec{a} = -,\frac{GM}{r^3},\vec{r}
]

This acceleration determines how the smaller body moves over time.
Your simulation computes this at every time step (see *acc()* in physics.js).

---

## **3.2 Specific Mechanical Energy**

A body in orbit has two forms of energy:

* **Kinetic energy** from its speed
* **Potential energy** from its distance from the central mass

Combining them gives the **specific mechanical energy**:

[
E = \frac{u^2}{2} - \frac{GM}{r}
]

The sign of this energy tells us what kind of orbit a body follows:

| Energy (E) | Type of motion                                      |
| ---------- | --------------------------------------------------- |
| (E < 0)    | Bound orbit (circle or ellipse)                     |
| (E = 0)    | Parabolic escape (just enough energy to break free) |
| (E > 0)    | Hyperbolic escape (unbound)                         |

Inside the simulation, this value is calculated continuously and plotted in the **Energy chart**.

---

## **3.3 Eccentricity and the Shape of the Orbit**

The **eccentricity** (e) determines the orbit’s shape.
It depends on both energy and **angular momentum** (L):

[
e = \sqrt{1 + \frac{2EL^2}{(GM)^2}}
]

Different values of (e) correspond to the classic conic sections:

* **(e = 0)** → perfect circle
* **(0 < e < 1)** → ellipse
* **(e = 1)** → parabola
* **(e > 1)** → hyperbola

The simulation uses this formula to classify the orbit in real time.
This is what drives the “Orbit Type” indicator (*ellipse, parabolic, hyperbolic, fall*) you see in the UI.

## **3.4 Angular Momentum and Why DART Worked**

Angular momentum is defined as:

[
L = r , u_{\perp}
]

where (u_{\perp}) is the component of velocity perpendicular to the radius vector.
In an isolated two-body system:

> **Angular momentum is conserved.**

This has two important consequences:

1. If a body comes closer to the central mass, it must speed up.
2. A spacecraft impact that changes the asteroid’s velocity also changes its angular momentum and therefore its orbital path.

This is exactly what DART demonstrated:

* A small spacecraft added an extremely small change in speed (Δu).
* But because orbits are sensitive to initial conditions, this produced a measurable shift in Dimorphos’ orbital period.
* The effect was even stronger due to ejecta leaving the asteroid, enhancing momentum transfer.

Your simulation models these effects numerically: changing the starting speed (u) or the radius (r_0) immediately adjusts (E), (e), and the resulting trajectory.

---

## **3.5 Why These Concepts Matter for Students**

This section ties the physics to real education:

* Students see how core ideas from the curriculum—energy, forces, momentum—apply directly to a real NASA mission.
* They can experiment with how small changes in velocity or distance reshape an orbit.
* They discover how mathematical functions (like square roots, inverse-square laws, and conic sections) emerge naturally in physical problems.
* They learn to read and interpret scientific graphs, a key skill in STEM education.

Above all, students experience physics not as disconnected formulas, but as a dynamic system they can manipulate, test, and understand.



