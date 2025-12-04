# **1. Asteroids and Planetary Defense**

Asteroids are rocky bodies that orbit the Sun, ranging in size from a few meters to hundreds of kilometers. Most of them pose no threat to Earth, yet their long-term trajectories can change due to gravitational interactions, collisions with smaller objects, or even the subtle push of sunlight (the Yarkovsky effect). For this reason, space agencies continuously track thousands of **Near-Earth Objects (NEOs)** to assess whether any of them could one day approach our planet too closely.

Although impacts large enough to cause global damage are extremely rare, even a small asteroid—tens or hundreds of meters across—can generate significant regional destruction. The 2013 Chelyabinsk meteor, only about 20 meters in diameter, produced a shockwave that shattered windows across an entire city. Events like this highlight the importance of understanding how asteroids move and how we might intervene if one were ever found on a threatening path.

This is where **planetary defense** comes in. Planetary defense refers to all scientific, technological, and international efforts aimed at detecting potentially hazardous asteroids and developing strategies to prevent a collision with Earth. These strategies can include:

* **Orbital tracking and early prediction**, using telescopes and radar
* **Modeling asteroid structure and composition**, to understand how they behave physically
* **Deflection techniques**, which attempt to slightly change an asteroid’s orbit so it no longer intersects Earth

Among the proposed deflection methods, one of the most promising—and simplest—is the **kinetic impactor**: sending a spacecraft to collide with an asteroid to gently nudge it onto a safer path. Even a very small change in speed, applied years in advance, can shift an asteroid’s trajectory enough to avoid impact.

Understanding these ideas helps students connect classroom physics—gravity, energy, motion—with real-world challenges. It also highlights why missions like NASA’s DART are not science fiction experiments, but part of a growing global effort to ensure that humanity is capable of protecting Earth from natural hazards.

<p align="center">
  <img src="scripts/img/imagesasteroid.gif" alt="Asteroid animation" width="650">
  <br>
  <em>Figure 1. Mapping of Near-Earth Objects (NEOs) discovered over the past 20 years.</em>
  <br>
  <sub>Image credit: <a href="https://www.jpl.nasa.gov/news/twenty-years-of-tracking-near-earth-objects/">NASA / JPL-Caltech</a></sub>
</p>

---

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

<p align="center">
  <img src="scripts/img/DART-infographic.jpg" alt="Asteroid animation" width="750">
  <br>
  <em>Figure 2. llustration of how DART's impact altered the orbit of Dimorphos about Didymos. Telescopes on Earth are used to measure the change in the orbit of Dimorphos to evaluate the effectiveness of the DART impact.</em>
  <br>
  <sub>Image credit: <a href="https://dart.jhuapl.edu/Mission/index.php">DART Mission</a></sub>
</p>

---

# 3. Orbital Dynamics and Impact Physics

This section summarises the core physics of motion in a central gravitational field, the classification of orbits as conic sections, and the effect of a kinetic impact on an orbiting body. We consider a two-body system where one body is much more massive than the other, $` M \gg m `$, so that the massive body can be treated as fixed at the origin.

---

## 3.1 Equation of Motion in a Central Gravitational Field

In a two-body system with $` M \gg m `$, the motion can be described by the position vector $`\vec r(t)`$ of the small body $`m`$ relative to the massive body $`M`$.  
The gravitational force is:

```math
\vec{F} = -\frac{GMm}{r^3}\,\vec{r}
````

where $`G`$ is the gravitational constant and $`r = |\vec r|`$.

Newton’s second law gives the equation of motion:

```math
m\ddot{\vec{r}} = -\frac{GMm}{r^3}\vec{r}
\quad\Rightarrow\quad
\ddot{\vec{r}} = -\frac{GM}{r^3}\vec{r}
```

Thus the gravitational acceleration is:

```math
\vec{a} = -\frac{GM}{r^3}\vec{r}
```

This is the standard central-force law for the Newtonian two-body problem.

Because the force is central, the motion always lies in a plane.
Using polar coordinates $`(r,\theta)`$, the motion is determined by:

* the **initial distance** $`r_0`$
* the **initial velocity vector** $`\vec u_0`$, decomposed into radial and tangential components

The tangential component determines the **angular momentum**, which together with the total speed fixes the orbit’s shape.

---

## 3.2 Energy, Angular Momentum and Orbit Classification

Two conserved quantities completely characterise the orbit in a central $`1/r^2`$ field:

### 1. Specific mechanical energy

```math
E = \frac{u^2}{2} - \frac{GM}{r}
```

where $`u = |\vec u|`$ is the speed.

### 2. Specific angular momentum

```math
h = r\,u_{\perp}
```

where $`u_\perp`$ is the tangential velocity component.

Given initial conditions:

```math
r(0) = r_0,\qquad u(0) = u_0
```

with $`u_0`$ tangential, we obtain:

```math
E = \frac{u_0^2}{2} - \frac{GM}{r_0},
\qquad
h = r_0 u_0
```

Orbit type follows from $`E`$:

* $`E < 0`$ : bound orbit (circle or ellipse)
* $`E = 0`$ : parabolic trajectory
* $`E > 0`$ : hyperbolic trajectory

Circular and escape speeds:

```math
u_{\text{circ}} = \sqrt{\frac{GM}{r_0}},
\qquad
u_{\text{esc}} = \sqrt{\frac{2GM}{r_0}}
```

Thus:

* If $`u_0 = u_{\text{circ}}`$, the orbit is exactly circular.
* If $`u_0 < u_{\text{circ}}`$, the orbit is an ellipse.
* If $`u_{\text{circ}} < u_0 < u_{\text{esc}}`$, the ellipse is more eccentric.
* If $`u_0 = u_{\text{esc}}`$, the trajectory is parabolic.
* If $`u_0 > u_{\text{esc}}`$, the trajectory is hyperbolic and the body escapes.

---

## 3.3 Eccentricity and Conic Sections

Eccentricity is defined by:

```math
e = \sqrt{1 + \frac{2Eh^2}{(GM)^2}}
```

Using initial conditions:

```math
e = \sqrt{1 + \frac{2E r_0^2 u_0^2}{(GM)^2}}
```

Interpretation of $`e`$:

* $`e = 0`$ → **circle**
* $`0 < e < 1`$ → **ellipse**
* $`e = 1`$ → **parabola**
* $`e > 1`$ → **hyperbola**

The polar form of the orbit:

```math
r(\theta) = \frac{p}{1 + e\cos(\theta - \theta_0)}
```

with:

```math
p = \frac{h^2}{GM}
```

Periapsis and apoapsis:

```math
r_{\text{peri}} = \frac{p}{1 + e},
\qquad
r_{\text{apo}} = \frac{p}{1 - e}
```

Thus $`r_0`$ and $`u_0`$ fully determine $`E`$, $`h`$, $`e`$, and therefore the entire conic orbit.

---

## 3.4 Keplerian Motion in Bound Orbits

For bound orbits ($`E < 0`$ and $`e < 1`$), the trajectory is an ellipse with semi-major axis:

```math
a = -\frac{GM}{2E}
```

Kepler’s Third Law gives the orbital period:

```math
T = 2\pi\sqrt{\frac{a^3}{GM}}
```

Mean motion:

```math
n = \sqrt{\frac{GM}{a^3}}
```

Mean anomaly:

```math
M(t) = M_0 + n t
```

Kepler’s equation:

```math
M = E - e\sin E
```

Parametric form:

```math
x' = a(\cos E - e)
```

```math
y' = a\sqrt{1 - e^2}\sin E
```

Radius:

```math
r = a(1 - e\cos E)
```

Velocity components:

```math
v_{x'} = -\frac{\sqrt{GMa}}{r}\sin E
```

```math
v_{y'} = \frac{\sqrt{GMa}}{r}\sqrt{1 - e^2}\cos E
```

---

## 3.5 Radial Motion and Free Fall

If the tangential velocity is negligible ($`u_0 \approx 0`$), then:

```math
h = r_0 u_0 \approx 0
```

The orbit becomes nearly radial. The motion satisfies:

```math
E = \frac{\dot r^2}{2} - \frac{GM}{r}
```

A sufficiently low-energy trajectory results in inward fall and collision.

---

## 3.6 Physical Radius and Collision Criterion

Assuming a spherical body of density $`\rho`$:

```math
M = \frac{4}{3}\pi R^3 \rho
```

Thus:

```math
R = \left(\frac{3M}{4\pi\rho}\right)^{1/3}
```

Collision occurs when:

```math
r(t) \le R
```

For an ellipse, collision occurs if:

```math
r_{\text{peri}} = \frac{p}{1+e} \le R
```

---

## 3.7 Kinetic Impact and Change of Orbit

For a perfectly inelastic impact:

```math
\vec{v}' = \frac{m\vec{v} + m_D\vec{v}_D}{m + m_D}
```

New specific mechanical energy:

```math
E' = \frac{\|\vec{v}'\|^2}{2} - \frac{GM}{r}
```

New angular momentum:

```math
h' = r\,u'_{\perp}
```

New eccentricity:

```math
e' = \sqrt{1 + \frac{2E' h'^2}{(GM)^2}}
```

Collision if:

```math
r'_{\text{peri}} \le R
```

A positive $`E'`$ with $`e' > 1`$ corresponds to hyperbolic escape.

---



