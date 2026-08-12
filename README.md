# 🏗️ TABLE TOWER

> **A physics-based multiplayer tower game where every move can bring the whole structure down.**

**Table Tower** is a browser-based 3D physics game designed for **local 2-player pass-and-play**. Players take turns carefully pulling blocks from a wooden tower while trying to keep it stable.

One wrong move... **and the tower collapses.** 💥

---

## 🎮 Game Overview

The goal is simple:

**Remove blocks without collapsing the tower.**

Two players share the same laptop and take turns. Each player has a limited amount of time to make their move.

* 🧱 54 physics-based blocks
* 👥 2-player local multiplayer
* ⏱️ 15-second turn timer
* 🎯 Pull blocks using drag interaction
* ⚖️ Dynamic stability calculation
* 💥 Real-time tower collapse
* 🏆 Remove 15 blocks to achieve the victory target
* 🎚️ Easy, Normal and Hard difficulty modes
* 🔊 Physics-based sound effects
* ✨ Particle effects and visual feedback
* 🎥 Interactive 3D camera

---

## 🕹️ How to Play

### 1. Start the Game

Click:

**▶ START GAME**

Player 1 gets the first turn.

### 2. Select a Block

Click on a block in the 3D tower.

### 3. Pull the Block

Drag the block along its length to remove it from the tower.

### 4. Watch the Tower

The game continuously evaluates the tower's:

* Center of mass
* Tilt angle
* Movement energy
* Base support
* Overall stability

### 5. Pass the Turn

After successfully removing a block, the turn automatically passes to the other player.

### 6. Don't Collapse the Tower

If the tower becomes unstable and collapses, the game ends.

The player responsible for the collapse loses the game.

---

## 🧠 Physics System

Table Tower uses a real-time physics simulation rather than simply animating the blocks.

### Physics Engine

**Cannon-es** handles:

* Gravity
* Collisions
* Friction
* Restitution
* Linear movement
* Angular movement
* Sleeping bodies
* Structural instability

The tower consists of **18 levels × 3 blocks = 54 blocks**.

Each block is represented by both:

1. A **Three.js mesh** for visual rendering
2. A **Cannon-es physics body** for physical simulation

This allows the visual tower and physical tower to interact in real time.

---

## ⚖️ Stability Detection

The game calculates a stability score based on several factors.

### Center of Mass

The system calculates the combined center of mass of all remaining blocks.

If the center of mass moves outside the supporting region, the tower becomes increasingly unstable.

### Tilt

The rotation of the blocks is continuously monitored.

Large deviations from the vertical direction increase the collapse risk.

### Kinetic Energy

The movement of the tower is also considered.

Large amounts of movement indicate that the tower is actively destabilizing.

### Stability Score

These factors are combined into a stability score between:

**0% → 100%**

The interface displays the current condition:

| Stability | Risk   |
| --------- | ------ |
| 🟢 High   | LOW    |
| 🟡 Medium | MEDIUM |
| 🔴 Low    | HIGH   |

---

## 👥 Local Multiplayer

Table Tower does not require an online multiplayer server.

Instead, it uses a **pass-and-play multiplayer system**.

### Player Flow

```text
Player 1
   ↓
Make a move
   ↓
Block successfully removed
   ↓
Player 2
   ↓
Make a move
   ↓
Block successfully removed
   ↓
Player 1
   ↓
Repeat
```

Each player gets **15 seconds** to make their move.

Players can also use the **LOSS** button to forfeit the current game.

---

## 🎚️ Difficulty Modes

The game provides three difficulty levels:

### Easy

More forgiving physics and higher damping.

### Normal

Balanced physics for regular gameplay.

### Hard

Lower friction and damping with increased sensitivity to instability.

This changes the behavior of the physics simulation rather than simply changing a score multiplier.

---

## 🛠️ Technology Stack

| Technology        | Purpose                          |
| ----------------- | -------------------------------- |
| **HTML5**         | Game structure                   |
| **CSS3**          | Interface and visual design      |
| **JavaScript**    | Game logic                       |
| **Three.js**      | 3D rendering                     |
| **Cannon-es**     | Physics simulation               |
| **WebGL**         | Hardware-accelerated 3D graphics |
| **Web Audio API** | Sound effects                    |

The project runs entirely in the browser and does not require a backend or build system.

---

## 🎨 Visual Design

The game uses a dark, cinematic interface with a warm wooden tower.

The interface includes:

* 3D tower viewport
* Stability gauge
* Center-of-mass indicator
* Move history
* Player status
* Turn timer
* Difficulty selector
* Physics information
* Interactive camera controls

Wood textures are generated procedurally using JavaScript, so no external texture assets are required.

---

## 🎮 Controls

| Action        | Control       |
| ------------- | ------------- |
| Rotate camera | Left drag     |
| Pan camera    | Right drag    |
| Zoom          | Scroll        |
| Select block  | Click         |
| Pull block    | Drag block    |
| Reset game    | `R`           |
| Reset camera  | Camera button |

On mobile devices, the interface provides panel toggles for accessing the game information and controls.

---

## 🚀 Running the Project

No build process is required.

### Option 1 — Open Locally

Clone the repository:

```bash
git clone https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
```

Open the project folder and run the HTML file using a local server.

For example, with VS Code:

**Live Server → Open with Live Server**

### Option 2 — GitHub Pages

The project can also be deployed using **GitHub Pages**.

Because the project uses browser-based ES modules and external CDN dependencies, running it through a local server or GitHub Pages is recommended instead of opening the HTML file directly with `file://`.

---

## 📁 Project Structure

```text
TABLE-TOWER/
│
├── index.html
└── README.md
```

The current prototype is intentionally lightweight and keeps the main game implementation inside a single HTML file.

---

## 🏆 Hackathon Focus

Table Tower was built as a **focused interactive physics toy/game prototype**.

Rather than creating a large game with many features, the project focuses on one core interaction:

> **Can you remove a block without bringing the tower down?**

The combination of real-time physics, player decisions, instability feedback, and local multiplayer creates an experience that is easy to understand but difficult to master.

---

## 🔮 Future Improvements

Possible future development includes:

* 🌐 Online multiplayer
* 🏅 Global leaderboard
* 👤 Custom player names
* 🎨 Different tower materials and themes
* 🧱 More block shapes
* 🏗️ Custom tower-building mode
* 📱 Improved mobile controls
* 🎯 Advanced scoring system
* 🏆 Achievement system
* 🎵 More dynamic audio
* 💾 Game statistics and replay system

---

## 👨‍💻 Team

**Team:** *[Your Team Name]*

**Hackathon:** *[Hackathon Name]*

**Theme:** Toys & Games

---

## 📜 License

This project was created as a hackathon prototype.

Add your preferred license here if the project is intended to be open source.

---

### ⭐ Built with physics, patience, and a little bit of chaos.

**Pull carefully. The tower is watching.** 🧱💥
