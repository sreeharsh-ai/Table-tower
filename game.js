/* =====================================================================
   TABLE TOWER — full 3D physics block-tower game
   Three.js (rendering) + cannon-es (physics), no backend, no build step.
   ===================================================================== */

async function boot() {
  const loadingEl = document.getElementById('loading');
  try {
    const canvasTest = document.createElement('canvas');
    const gl = canvasTest.getContext('webgl2') || canvasTest.getContext('webgl');
    if (!gl) throw new Error('WebGL unavailable');

    const THREE = await import('three');
    const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
    const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');
    const CANNON = await import('cannon-es');

    const game = new Game(THREE, OrbitControls, RoomEnvironment, CANNON);
    await game.init();
    loadingEl.style.opacity = '0';
    setTimeout(() => loadingEl.style.display = 'none', 500);
    window.__tableTower = game;
  } catch (err) {
    console.error('TABLE TOWER fatal init error:', err);
    loadingEl.style.display = 'none';
    document.getElementById('fatal-error').style.display = 'flex';
  }
}


/* --------------------------- constants --------------------------- */

const LEVELS = 18;
const PER_LEVEL = 3;
const TOTAL_BLOCKS = LEVELS * PER_LEVEL;

const BLOCK_LEN = 3.0;
const BLOCK_WID = 0.98;
const BLOCK_HEI = 0.55;
const GAP = 0.045;
const TABLE_TOP_Y = 0;
const WIN_TARGET = 15;
const EXTRACT_RATIO = 0.92;

const DIFFICULTY = {
  EASY: {
    friction: 0.62,
    restitution: 0.05,
    linDamp: 0.35,
    angDamp: 0.45,
    sensitivity: 0.7
  },

  NORMAL: {
    friction: 0.46,
    restitution: 0.08,
    linDamp: 0.22,
    angDamp: 0.30,
    sensitivity: 1.0
  },

  HARD: {
    friction: 0.30,
    restitution: 0.12,
    linDamp: 0.12,
    angDamp: 0.16,
    sensitivity: 1.45
  }
};


/* ============================== SOUND ============================== */

class SoundManager {

  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this._scrapeNode = null;
    this._rumbleNode = null;
  }

  ensure() {
    if (this.ctx) return;

    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();

      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);

    } catch (e) {
      // audio unavailable — game continues silently
    }
  }

  setMuted(m) {
    this.muted = m;

    if (this.master) {
      this.master.gain.value = m ? 0 : 0.5;
    }
  }

  _noiseBuffer(duration) {
    const sr = this.ctx.sampleRate;

    const buf = this.ctx.createBuffer(
      1,
      sr * duration,
      sr
    );

    const data = buf.getChannelData(0);

    for (let i = 0; i < data.length; i++) {
      data[i] =
        (Math.random() * 2 - 1) *
        (1 - i / data.length);
    }

    return buf;
  }

  click() {
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(720, t);

    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      t + 0.09
    );

    osc.connect(gain);
    gain.connect(this.master);

    osc.start(t);
    osc.stop(t + 0.1);
  }

  knock(strength = 1) {
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    const src = this.ctx.createBufferSource();

    src.buffer = this._noiseBuffer(0.06);

    const filter = this.ctx.createBiquadFilter();

    filter.type = 'bandpass';
    filter.frequency.value =
      500 + Math.random() * 400;
    filter.Q.value = 1.2;

    const gain = this.ctx.createGain();

    gain.gain.setValueAtTime(
      Math.min(0.35, 0.18 * strength),
      t
    );

    gain.gain.exponentialRampToValueAtTime(
      0.001,
      t + 0.15
    );

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);

    src.start(t);
  }

  startScrape() {
    if (!this.ctx || this._scrapeNode) return;

    const src = this.ctx.createBufferSource();

    const buf = this._noiseBuffer(1.0);
    buf.loop = true;

    src.buffer = buf;
    src.loop = true;

    const filter = this.ctx.createBiquadFilter();

    filter.type = 'highpass';
    filter.frequency.value = 1200;

    const gain = this.ctx.createGain();
    gain.gain.value = 0.05;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);

    src.start();

    this._scrapeNode = {
      src,
      gain
    };
  }

  stopScrape() {
    if (!this._scrapeNode) return;

    const {
      src,
      gain
    } = this._scrapeNode;

    const t = this.ctx.currentTime;

    gain.gain.exponentialRampToValueAtTime(
      0.001,
      t + 0.12
    );

    src.stop(t + 0.15);

    this._scrapeNode = null;
  }

  startRumble() {
    if (!this.ctx || this._rumbleNode) return;

    const osc = this.ctx.createOscillator();

    osc.type = 'sine';
    osc.frequency.value = 48;

    const gain = this.ctx.createGain();

    gain.gain.value = 0.0;

    gain.gain.linearRampToValueAtTime(
      0.12,
      this.ctx.currentTime + 0.4
    );

    osc.connect(gain);
    gain.connect(this.master);

    osc.start();

    this._rumbleNode = {
      osc,
      gain
    };
  }

  stopRumble() {
    if (!this._rumbleNode) return;

    const {
      osc,
      gain
    } = this._rumbleNode;

    const t = this.ctx.currentTime;

    gain.gain.exponentialRampToValueAtTime(
      0.001,
      t + 0.3
    );

    osc.stop(t + 0.35);

    this._rumbleNode = null;
  }

  crash() {
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    const src = this.ctx.createBufferSource();

    src.buffer = this._noiseBuffer(0.9);

    const filter = this.ctx.createBiquadFilter();

    filter.type = 'lowpass';

    filter.frequency.setValueAtTime(
      2200,
      t
    );

    filter.frequency.exponentialRampToValueAtTime(
      200,
      t + 0.8
    );

    const gain = this.ctx.createGain();

    gain.gain.setValueAtTime(
      0.55,
      t
    );

    gain.gain.exponentialRampToValueAtTime(
      0.001,
      t + 0.9
    );

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);

    src.start(t);

    for (let i = 0; i < 4; i++) {
      setTimeout(
        () => this.knock(1.4),
        i * 70
      );
    }
  }
}


/* ============================ PARTICLES ============================ */

class ParticleManager {

  constructor(THREE, scene) {

    this.THREE = THREE;

    this.MAX = 500;

    this.geo = new THREE.BufferGeometry();

    this.positions =
      new Float32Array(this.MAX * 3);

    this.velocities =
      new Float32Array(this.MAX * 3);

    this.life =
      new Float32Array(this.MAX);

    this.maxLife =
      new Float32Array(this.MAX);

    this.colors =
      new Float32Array(this.MAX * 3);

    this.geo.setAttribute(
      'position',
      new THREE.BufferAttribute(
        this.positions,
        3
      )
    );

    this.geo.setAttribute(
      'color',
      new THREE.BufferAttribute(
        this.colors,
        3
      )
    );

    this.mat =
      new THREE.PointsMaterial({
        size: 0.06,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        depthWrite: false
      });

    this.points =
      new THREE.Points(
        this.geo,
        this.mat
      );

    this.points.frustumCulled = false;

    scene.add(this.points);

    this.cursor = 0;
  }

  spawnBurst(
    pos,
    count,
    color,
    spread = 1,
    speed = 2,
    lifeRange = [0.5, 1.1]
  ) {

    const c =
      new this.THREE.Color(color);

    for (let n = 0; n < count; n++) {

      const i = this.cursor;

      this.cursor =
        (this.cursor + 1) % this.MAX;

      this.positions[i * 3] =
        pos.x +
        (Math.random() - 0.5) * 0.2;

      this.positions[i * 3 + 1] =
        pos.y +
        (Math.random() - 0.5) * 0.2;

      this.positions[i * 3 + 2] =
        pos.z +
        (Math.random() - 0.5) * 0.2;

      const a =
        Math.random() * Math.PI * 2;

      const el =
        Math.random() * Math.PI -
        Math.PI / 2;

      const s =
        speed *
        (0.4 + Math.random() * 0.8);

      this.velocities[i * 3] =
        Math.cos(a) *
        Math.cos(el) *
        s *
        spread;

      this.velocities[i * 3 + 1] =
        Math.sin(el) *
        s *
        0.6 +
        0.6;

      this.velocities[i * 3 + 2] =
        Math.sin(a) *
        Math.cos(el) *
        s *
        spread;

      this.life[i] =
        lifeRange[0] +
        Math.random() *
        (lifeRange[1] - lifeRange[0]);

      this.maxLife[i] =
        this.life[i];

      this.colors[i * 3] =
        c.r;

      this.colors[i * 3 + 1] =
        c.g;

      this.colors[i * 3 + 2] =
        c.b;
    }
  }

  update(dt) {

    let any = false;

    for (let i = 0; i < this.MAX; i++) {

      if (this.life[i] <= 0) continue;

      any = true;

      this.life[i] -= dt;

      this.velocities[i * 3 + 1] -=
        2.2 * dt;

      this.positions[i * 3] +=
        this.velocities[i * 3] * dt;

      this.positions[i * 3 + 1] +=
        this.velocities[i * 3 + 1] * dt;

      this.positions[i * 3 + 2] +=
        this.velocities[i * 3 + 2] * dt;

      if (this.life[i] <= 0) {
        this.positions[i * 3 + 1] =
          -9999;
      }
    }

    if (any) {
      this.geo.attributes.position
        .needsUpdate = true;
    }
  }
}


/* ============================== BLOCK =============================== */

class Block {

  constructor(
    THREE,
    CANNON,
    id,
    level,
    idxInLevel,
    material,
    woodMat,
    physMat
  ) {

    this.id = id;
    this.level = level;
    this.idxInLevel = idxInLevel;

    this.removed = false;
    this.dragging = false;
    this.selected = false;

    this.mass = 0.85;

    const even =
      level % 2 === 0;

    const offset =
      (idxInLevel - 1) *
      (BLOCK_WID + GAP);

    const y =
      TABLE_TOP_Y +
      BLOCK_HEI / 2 +
      level *
        (BLOCK_HEI + GAP * 0.4) +
      0.01;

    let x = 0;
    let z = 0;

    if (even) {
      z = offset;
    } else {
      x = offset;
    }

    const geo =
      new THREE.BoxGeometry(
        BLOCK_LEN,
        BLOCK_HEI,
        BLOCK_WID,
        1,
        1,
        1
      );

    this.mesh =
      new THREE.Mesh(
        geo,
        woodMat.clone()
      );

    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;

    this.mesh.userData.blockRef =
      this;

    const quat =
      new THREE.Quaternion();

    if (!even) {
      quat.setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        Math.PI / 2
      );
    }

    this.mesh.position.set(
      x,
      y,
      z
    );

    this.mesh.quaternion.copy(
      quat
    );

    const hueShift =
      (Math.random() - 0.5) * 0.03;

    this.mesh.material.color.offsetHSL(
      hueShift,
      (Math.random() - 0.5) * 0.05,
      (Math.random() - 0.5) * 0.04
    );

    this.originalPos =
      new THREE.Vector3(
        x,
        y,
        z
      );

    this.originalQuat =
      quat.clone();

    const shape =
      new CANNON.Box(
        new CANNON.Vec3(
          BLOCK_LEN / 2,
          BLOCK_HEI / 2,
          BLOCK_WID / 2
        )
      );

    this.body =
      new CANNON.Body({
        mass: this.mass,
        shape,
        material: physMat,

        position:
          new CANNON.Vec3(
            x,
            y,
            z
          ),

        quaternion:
          new CANNON.Quaternion(
            quat.x,
            quat.y,
            quat.z,
            quat.w
          ),

        linearDamping: 0.22,
        angularDamping: 0.30
      });

    this.body.allowSleep = true;

    this.body.sleepSpeedLimit =
      0.12;

    this.body.sleepTimeLimit =
      0.6;

    this.body.userData = {
      blockId: id
    };

    this._localAxis =
      new THREE.Vector3(
        1,
        0,
        0
      );
  }

  pullAxisWorld(THREE) {
    return this._localAxis
      .clone()
      .applyQuaternion(
        this.mesh.quaternion
      )
      .normalize();
  }

  syncMeshFromBody() {
    this.mesh.position.copy(
      this.body.position
    );

    this.mesh.quaternion.copy(
      this.body.quaternion
    );
  }

  setHighlight(on) {

    this.selected = on;

    const m =
      this.mesh.material;

    m.emissive.setHex(
      on ? 0xe8b055 : 0x000000
    );

    m.emissiveIntensity =
      on ? 0.55 : 0.0;
  }

  extractionAmount() {

    const axis =
      this.pullAxisWorld();

    const delta =
      this.mesh.position
        .clone()
        .sub(this.originalPos);

    return delta.dot(axis);
  }
}


/* ============================== TOWER ================================ */

class Tower {

  constructor(
    THREE,
    CANNON,
    scene,
    world,
    woodMat,
    physMat
  ) {

    this.THREE = THREE;
    this.CANNON = CANNON;

    this.scene = scene;
    this.world = world;

    this.woodMat = woodMat;
    this.physMat = physMat;

    this.blocks = [];
    this.removedCount = 0;

    this._build();
  }

  _build() {

    let id = 1;

    for (
      let level = 0;
      level < LEVELS;
      level++
    ) {

      for (
        let idx = 0;
        idx < PER_LEVEL;
        idx++
      ) {

        const b =
          new Block(
            this.THREE,
            this.CANNON,
            id,
            level,
            idx,
            this.THREE,
            this.woodMat,
            this.physMat
          );

        this.scene.add(
          b.mesh
        );

        this.world.addBody(
          b.body
        );

        this.blocks.push(b);

        id++;
      }
    }
  }

  get activeBlocks() {
    return this.blocks.filter(
      b => !b.removed
    );
  }

  towerHeight() {
    return LEVELS *
      (BLOCK_HEI + GAP * 0.4);
  }

  center() {
    return new this.THREE.Vector3(
      0,
      this.towerHeight() / 2,
      0
    );
  }

  computeStability(
    sensitivity
  ) {

    const THREE = this.THREE;

    const active =
      this.activeBlocks;

    if (active.length === 0) {

      return {
        com:
          new THREE.Vector3(),

        comOffset: 0,

        tiltDeg: 0,

        energy: 0,

        score: 100,

        supportHalf:
          BLOCK_LEN / 2
      };
    }

    let totalMass = 0;

    const com =
      new THREE.Vector3();

    for (const b of active) {

      com.addScaledVector(
        b.mesh.position,
        b.mass
      );

      totalMass += b.mass;
    }

    com.divideScalar(
      totalMass || 1
    );

    let minLevel =
      Infinity;

    for (const b of active) {

      if (b.level < minLevel) {
        minLevel = b.level;
      }
    }

    const baseBlocks =
      active.filter(
        b => b.level === minLevel
      );

    let minX = Infinity;
    let maxX = -Infinity;

    let minZ = Infinity;
    let maxZ = -Infinity;

    for (const b of baseBlocks) {

      const hx =
        (b.level % 2 === 0)
          ? BLOCK_LEN / 2
          : BLOCK_WID / 2;

      const hz =
        (b.level % 2 === 0)
          ? BLOCK_WID / 2
          : BLOCK_LEN / 2;

      minX = Math.min(
        minX,
        b.mesh.position.x - hx
      );

      maxX = Math.max(
        maxX,
        b.mesh.position.x + hx
      );

      minZ = Math.min(
        minZ,
        b.mesh.position.z - hz
      );

      maxZ = Math.max(
        maxZ,
        b.mesh.position.z + hz
      );
    }

    const baseFactor =
      baseBlocks.length /
      PER_LEVEL;

    const cx =
      (minX + maxX) / 2;

    const cz =
      (minZ + maxZ) / 2;

    const halfX =
      Math.max(
        0.15,
        ((maxX - minX) / 2) *
          (0.5 + 0.5 * baseFactor)
      );

    const halfZ =
      Math.max(
        0.15,
        ((maxZ - minZ) / 2) *
          (0.5 + 0.5 * baseFactor)
      );

    const dx =
      Math.max(
        0,
        Math.abs(com.x - cx) -
          halfX
      );

    const dz =
      Math.max(
        0,
        Math.abs(com.z - cz) -
          halfZ
      );

    const comOffset =
      Math.sqrt(
        dx * dx +
        dz * dz
      );

    let maxTilt = 0;

    const worldUp =
      new THREE.Vector3(
        0,
        1,
        0
      );

    for (const b of active) {

      const up =
        new THREE.Vector3(
          0,
          1,
          0
        )
          .applyQuaternion(
            b.mesh.quaternion
          );

      const ang =
        THREE.MathUtils.radToDeg(
          up.angleTo(worldUp)
        );

      if (ang > maxTilt) {
        maxTilt = ang;
      }
    }

    let energy = 0;

    for (const b of active) {

      energy +=
        b.body.velocity
          .lengthSquared() *
        0.5 *
        b.mass;

      energy +=
        b.body.angularVelocity
          .lengthSquared() *
        0.15;
    }

    energy /=
      Math.max(
        1,
        active.length
      );

    const comMargin =
      (BLOCK_WID + GAP) *
      1.2;

    const tiltPenalty =
      Math.min(
        46,
        (maxTilt / 8) * 46
      ) *
      sensitivity;

    const comPenalty =
      Math.min(
        42,
        (comOffset / comMargin) * 42
      ) *
      sensitivity;

    const energyPenalty =
      Math.min(
        16,
        energy * 9
      ) *
      sensitivity;

    const score =
      Math.max(
        0,
        Math.min(
          100,
          100 -
            tiltPenalty -
            comPenalty -
            energyPenalty
        )
      );

    return {
      com,
      comOffset,
      tiltDeg: maxTilt,
      energy,
      score,
      supportHalfX: halfX,
      cx,
      comX: com.x
    };
  }

  reset() {

    for (const b of this.blocks) {

      this.scene.remove(
        b.mesh
      );

      this.world.removeBody(
        b.body
      );
    }

    this.blocks = [];
    this.removedCount = 0;

    this._build();
  }
}


/* ========================= CAMERA CONTROLLER ========================== */

class CameraController {

  constructor(
    THREE,
    OrbitControls,
    camera,
    domEl,
    target
  ) {

    this.THREE = THREE;
    this.camera = camera;

    this.target =
      target.clone();

    this.controls =
      new OrbitControls(
        camera,
        domEl
      );

    this.controls.enableDamping =
      true;

    this.controls.dampingFactor =
      0.08;

    this.controls.minDistance =
      5;

    this.controls.maxDistance =
      32;

    this.controls.minPolarAngle =
      0.12;

    this.controls.maxPolarAngle =
      Math.PI - 0.22;

    this.controls.target.copy(
      this.target
    );

    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN
    };

    this.controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN
    };

    this.controls.screenSpacePanning =
      true;

    this.introStart =
      new THREE.Vector3(
        22,
        16,
        20
      );

    this.introEnd =
      new THREE.Vector3(
        11,
        8.5,
        11
      );

    this.camera.position.copy(
      this.introStart
    );

    this.introT = 0;

    this.introDuration =
      1.8;

    this.introPlaying =
      true;

    this.controls.enabled =
      false;
  }

  update(dt) {

    if (this.introPlaying) {

      this.introT += dt;

      const t =
        Math.min(
          1,
          this.introT /
            this.introDuration
        );

      const ease =
        1 -
        Math.pow(
          1 - t,
          3
        );

      this.camera.position
        .lerpVectors(
          this.introStart,
          this.introEnd,
          ease
        );

      this.camera.lookAt(
        this.target
      );

      if (t >= 1) {

        this.introPlaying =
          false;

        this.controls.enabled =
          true;

        this.controls.update();
      }

      return;
    }

    if (this.controls.enabled) {
      this.controls.update();
    }
  }

  resetView() {

    this.controls.enabled =
      false;

    this.introStart.copy(
      this.camera.position
    );

    this.introEnd.set(
      11,
      8.5,
      11
    );

    this.introT = 0;

    this.introDuration =
      1.1;

    this.introPlaying =
      true;

    this.controls.target.copy(
      this.target
    );
  }
}


/* ============================== UI MANAGER ============================= */

class UIManager {

  constructor(callbacks) {

    this.cb = callbacks;

    this.el = {

      grid:
        document.getElementById(
          'piecesgrid'
        ),

      moves:
        document.getElementById(
          'gi-moves'
        ),

      time:
        document.getElementById(
          'gi-time'
        ),

      blocks:
        document.getElementById(
          'gi-blocks'
        ),

      status:
        document.getElementById(
          'gi-status'
        ),

      com:
        document.getElementById(
          'ph-com'
        ),

      comDot:
        document.getElementById(
          'com-dot'
        ),

      stabNum:
        document.getElementById(
          'ph-stab-num'
        ),

      gaugeFill:
        document.getElementById(
          'gauge-fill'
        ),

      gaugeNeedle:
        document.getElementById(
          'gauge-needle'
        ),

      gaugePct:
        document.getElementById(
          'gauge-pct'
        ),

      tilt:
        document.getElementById(
          'ph-tilt'
        ),

      risk:
        document.getElementById(
          'ph-risk'
        ),

      history:
        document.getElementById(
          'history'
        ),

      banner:
        document.getElementById(
          'statebanner'
        ),

      bannerText:
        document.getElementById(
          'statebanner-text'
        ),

      blockinfo:
        document.getElementById(
          'blockinfo'
        ),

      biTitle:
        document.getElementById(
          'bi-title'
        ),

      biLevel:
        document.getElementById(
          'bi-level'
        ),

      biMass:
        document.getElementById(
          'bi-mass'
        ),

      biState:
        document.getElementById(
          'bi-state'
        ),

      victory:
        document.getElementById(
          'victory'
        ),

      victoryText:
        document.getElementById(
          'victory-text'
        ),

      gameover:
        document.getElementById(
          'gameover'
        ),

      goTitle:
        document.getElementById(
          'go-title'
        ),

      goSub:
        document.getElementById(
          'go-sub'
        ),

      goMoves:
        document.getElementById(
          'go-moves'
        ),

      goTime:
        document.getElementById(
          'go-time'
        ),

      goBest:
        document.getElementById(
          'go-best'
        ),

      mute:
        document.getElementById(
          'mutebtn'
        ),

      leftPanel:
        document.getElementById(
          'leftpanel'
        ),

      rightPanel:
        document.getElementById(
          'rightpanel'
        ),

      startscreen:
        document.getElementById(
          'startscreen'
        ),

      playbtn:
        document.getElementById(
          'playbtn'
        ),

      turnbar:
        document.getElementById(
          'turnbar'
        ),

      turnPlayer:
        document.getElementById(
          'turn-player'
        ),

      turnTimer:
        document.getElementById(
          'turn-timer'
        ),

      forfeit:
        document.getElementById(
          'forfeitbtn'
        ),

      playersList:
        document.getElementById(
          'players-list'
        )
    };

    this._buildGrid();
    this._bindStatic();
  }

  _buildGrid() {

    this.el.grid.innerHTML = '';

    this.cells = [];

    for (
      let i = 1;
      i <= TOTAL_BLOCKS;
      i++
    ) {

      const cell =
        document.createElement(
          'div'
        );

      cell.className =
        'piece-cell';

      cell.textContent =
        String(i).padStart(
          2,
          '0'
        );

      cell.addEventListener(
        'click',
        () =>
          this.cb.onGridSelect(i)
      );

      this.el.grid.appendChild(
        cell
      );

      this.cells.push(
        cell
      );
    }
  }

  _bindStatic() {

    document
      .querySelectorAll(
        '.pill[data-diff]'
      )
      .forEach(btn => {

        btn.addEventListener(
          'click',
          () => {

            document
              .querySelectorAll(
                '.pill[data-diff]'
              )
              .forEach(b =>
                b.classList.remove(
                  'active'
                )
              );

            btn.classList.add(
              'active'
            );

            this.cb.onDifficulty(
              btn.dataset.diff
            );
          }
        );
      });

    document
      .getElementById(
        'resetbtn'
      )
      .addEventListener(
        'click',
        () => this.cb.onReset()
      );

    this.el.playbtn
      .addEventListener(
        'click',
        () => this.cb.onPlay()
      );

    this.el.forfeit
      .addEventListener(
        'click',
        () =>
          this.cb.onForfeit()
      );

    document
      .getElementById(
        'go-again'
      )
      .addEventListener(
        'click',
        () => this.cb.onReset()
      );

    document
      .getElementById(
        'camresetbtn'
      )
      .addEventListener(
        'click',
        () =>
          this.cb.onCameraReset()
      );

    this.el.mute
      .addEventListener(
        'click',
        () => {

          const nowMuted =
            !this.el.mute
              .classList
              .contains('on');

          this.el.mute
            .classList
            .toggle(
              'on',
              nowMuted
            );

          this.el.mute.textContent =
            nowMuted
              ? '🔊'
              : '🔇';

          this.cb.onMuteToggle(
            !nowMuted
          );
        }
      );

    document
      .getElementById(
        'victory-close'
      )
      .addEventListener(
        'click',
        () => {
          this.el.victory
            .classList
            .remove('show');
        }
      );

    document
      .getElementById(
        'toggle-left'
      )
      .addEventListener(
        'click',
        () => {

          this.el.leftPanel
            .classList
            .toggle('open');

          this.el.rightPanel
            .classList
            .remove('open');
        }
      );

    document
      .getElementById(
        'toggle-right'
      )
      .addEventListener(
        'click',
        () => {

          this.el.rightPanel
            .classList
            .toggle('open');

          this.el.leftPanel
            .classList
            .remove('open');
        }
      );

    window.addEventListener(
      'keydown',
      e => {

        if (
          e.key === 'r' ||
          e.key === 'R'
        ) {
          this.cb.onReset();
        }
      }
    );
  }

  setGridState(
    id,
    state
  ) {

    const cell =
      this.cells[id - 1];

    cell.classList.remove(
      'selected',
      'removed'
    );

    if (
      state === 'selected'
    ) {
      cell.classList.add(
        'selected'
      );
    }

    if (
      state === 'removed'
    ) {
      cell.classList.add(
        'removed'
      );
    }
  }

  refreshGrid(blocks) {

    for (const b of blocks) {

      this.setGridState(
        b.id,
        b.removed
          ? 'removed'
          : (
              b.selected
                ? 'selected'
                : 'default'
            )
      );
    }
  }

  updateGameInfo({
    moves,
    timeStr,
    remaining,
    total,
    statusLabel
  }) {

    this.el.moves.textContent =
      moves;

    this.el.time.textContent =
      timeStr;

    this.el.blocks.textContent =
      `${remaining}/${total}`;

    this.el.status.textContent =
      statusLabel;
  }

  updatePhysics({
    comLabel,
    comFrac,
    stabScore,
    tiltDeg,
    riskLabel,
    riskClass
  }) {

    this.el.com.textContent =
      comLabel;

    this.el.comDot.style.left =
      `${Math.max(
        0,
        Math.min(
          100,
          comFrac * 100
        )
      )}%`;

    this.el.comDot.style.background =
      riskClass === 'danger'
        ? 'var(--danger)'
        : (
            riskClass === 'warn'
              ? 'var(--warn)'
              : 'var(--gold)'
          );

    this.el.stabNum.textContent =
      `${Math.round(stabScore)}%`;

    this.el.gaugeFill.style.width =
      `${stabScore}%`;

    this.el.gaugeNeedle.style.left =
      `${stabScore}%`;

    this.el.gaugePct.textContent =
      `${Math.round(stabScore)}%`;

    const col =
      riskClass === 'danger'
        ? 'var(--danger)'
        : riskClass === 'warn'
          ? 'var(--warn)'
          : 'var(--ok)';

    this.el.gaugeFill.style.background =
      `linear-gradient(
        90deg,
        ${col},
        ${col}
      )`;

    this.el.tilt.textContent =
      `${tiltDeg.toFixed(1)}°`;

    this.el.risk.textContent =
      riskLabel;

    this.el.risk.className =
      'v ' + riskClass;

    this.el.stabNum.className =
      'v ' + riskClass;
  }

  pushHistory(entries) {

    if (entries.length === 0) {

      this.el.history.innerHTML =
        '<div class="h-empty">No moves yet</div>';

      return;
    }

    this.el.history.innerHTML =
      entries
        .map(
          e =>
            `<div class="h-item">
              <b>${e.n}</b>
              <span>${e.text}</span>
            </div>`
        )
        .join('');
  }

  setBanner(
    label,
    mode
  ) {

    this.el.bannerText.textContent =
      label;

    this.el.banner.classList.remove(
      'warning',
      'danger'
    );

    if (
      mode === 'warning'
    ) {
      this.el.banner.classList.add(
        'warning'
      );
    }

    if (
      mode === 'danger'
    ) {
      this.el.banner.classList.add(
        'danger'
      );
    }
  }

  showBlockInfo(block) {

    this.el.blockinfo
      .classList
      .add('show');

    this.el.biTitle.textContent =
      `BLOCK #${String(
        block.id
      ).padStart(2, '0')}`;

    this.el.biLevel.textContent =
      block.level + 1;

    this.el.biMass.textContent =
      `${block.mass.toFixed(2)} kg`;

    this.el.biState.textContent =
      block.removed
        ? 'Removed'
        : (
            block.extractionAmount() > 0.4
              ? 'Extracting'
              : 'Stable'
          );
  }

  hideBlockInfo() {
    this.el.blockinfo
      .classList
      .remove('show');
  }

  showStart(show) {

    this.el.startscreen
      .classList
      .toggle(
        'hide',
        !show
      );
  }

  showTurn(
    playerName,
    remaining
  ) {

    this.el.turnbar
      .classList
      .add('show');

    this.el.turnPlayer.textContent =
      playerName;

    this.el.turnTimer.textContent =
      `${remaining.toFixed(1)}s`;

    this.el.turnTimer
      .classList
      .toggle(
        'warning',
        remaining <= 7 &&
        remaining > 3
      );

    this.el.turnTimer
      .classList
      .toggle(
        'danger',
        remaining <= 3
      );
  }

  hideTurn() {

    this.el.turnbar
      .classList
      .remove('show');
  }

  renderPlayers(
    players,
    activeIndex
  ) {

    this.el.playersList.innerHTML =
      players
        .map(
          (p, i) => `
            <div class="player-row ${
              i === activeIndex
                ? 'active'
                : ''
            }">
              <span>
                <i></i>
                ${p.name}
              </span>
              <b>
                ${
                  i === activeIndex
                    ? 'TURN'
                    : 'WAITING'
                }
              </b>
            </div>
          `
        )
        .join('');
  }

  showVictory(text) {

    this.el.victoryText.textContent =
      text;

    this.el.victory
      .classList
      .add('show');
  }

  showGameOver({
    moves,
    timeStr,
    best
  }) {

    this.el.goMoves.textContent =
      moves;

    this.el.goTime.textContent =
      timeStr;

    this.el.goBest.textContent =
      best == null
        ? '—'
        : `${best} moves`;

    this.el.gameover
      .classList
      .add('show');
  }

  hideGameOver() {

    this.el.gameover
      .classList
      .remove('show');
  }
}


/* ================================ GAME ================================= */

class Game {

  constructor(
    THREE,
    OrbitControls,
    RoomEnvironment,
    CANNON
  ) {

    this.THREE = THREE;
    this.OrbitControls =
      OrbitControls;

    this.RoomEnvironment =
      RoomEnvironment;

    this.CANNON = CANNON;

    this.difficulty =
      'NORMAL';

    this.status =
      'START';

    this.moves = 0;

    this.startTime =
      null;

    this.elapsed = 0;

    this.timerRunning =
      false;

    this.bestMoves =
      null;

    this.history = [];

    this.selectedBlock =
      null;

    this.dragCandidate =
      null;

    this.dragging =
      false;

    this.dragStartScreen =
      null;

    this.dragPlane =
      null;

    this.dragStartWorld =
      null;

    this.dragOriginPos =
      null;

    this.dragTargetExtra =
      0;

    this.collapseSettleTimer =
      0;

    this.victoryShown =
      false;

    this.frameCount =
      0;

    this.lastCollisionSoundT =
      0;

    this.players = [
      {
        id: 'p1',
        name: 'Player 1'
      },
      {
        id: 'p2',
        name: 'Player 2'
      }
    ];

    this.currentPlayerIndex =
      0;

    this.turnTimeLimit =
      15;

    this.turnRemaining =
      this.turnTimeLimit;

    this.turnTimerRunning =
      false;

    this.gameStarted =
      false;

    this.blockControlEnabled =
      true;

    this.isDraggingBlock =
      false;

    this.activePointerId =
      null;

    this.blockControlEnabled =
      true;
  }

  async init() {

    const THREE =
      this.THREE;

    this.sound =
      new SoundManager();

    this._initThree();

    this._initPhysics();

    this._buildEnvironment();

    this.tower =
      new Tower(
        THREE,
        this.CANNON,
        this.scene,
        this.world,
        this.woodMat,
        this.physMaterial
      );

    this.particles =
      new ParticleManager(
        THREE,
        this.scene
      );

    this.camCtrl =
      new CameraController(
        THREE,
        this.OrbitControls,
        this.camera,
        this.renderer.domElement,
        this.tower.center()
      );

    this.ui =
      new UIManager({

        onDifficulty:
          d => this.setDifficulty(d),

        onReset:
          () => this.reset(),

        onCameraReset:
          () => this.camCtrl.resetView(),

        onMuteToggle:
          m => {
            this.sound.setMuted(m);
          },

        onGridSelect:
          id => this._selectById(id),

        onPlay:
          () => this.startGame(),

        onForfeit:
          () => this.forfeitCurrentPlayer()
      });

    this.ui.setBanner(
      'Ready',
      'ok'
    );

    this.ui.updateGameInfo({
      moves: 0,
      timeStr: '00:00',
      remaining: TOTAL_BLOCKS,
      total: TOTAL_BLOCKS,
      statusLabel: 'READY'
    });

    this.ui.refreshGrid(
      this.tower.blocks
    );

    this.ui.showStart(true);

    this.ui.renderPlayers(
      this.players,
      this.currentPlayerIndex
    );

    this._bindInput();

    window.addEventListener(
      'resize',
      () => this._onResize()
    );

    this._onResize();

    this._collisionSetup();

    this.clock =
      new THREE.Clock();

    this._raf =
      requestAnimationFrame(
        () => this._loop()
      );
  }


  /* --------------------------- three.js setup --------------------------- */

  _initThree() {

    const THREE =
      this.THREE;

    this.scene =
      new THREE.Scene();

    this.scene.background =
      new THREE.Color(
        0x0b0d12
      );

    this.scene.fog =
      new THREE.Fog(
        0x0b0d12,
        22,
        46
      );

    const host =
      document.getElementById(
        'canvas-host'
      );

    this.camera =
      new THREE.PerspectiveCamera(
        45,
        host.clientWidth /
          host.clientHeight,
        0.1,
        200
      );

    this.renderer =
      new THREE.WebGLRenderer({
        antialias: true,
        powerPreference:
          'high-performance'
      });

    this.renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio,
        2
      )
    );

    this.renderer.setSize(
      host.clientWidth,
      host.clientHeight
    );

    this.renderer.shadowMap.enabled =
      true;

    this.renderer.shadowMap.type =
      THREE.PCFSoftShadowMap;

    this.renderer.outputColorSpace =
      THREE.SRGBColorSpace;

    this.renderer.toneMapping =
      THREE.ACESFilmicToneMapping;

    this.renderer.toneMappingExposure =
      1.05;

    host.appendChild(
      this.renderer.domElement
    );

    const pmrem =
      new THREE.PMREMGenerator(
        this.renderer
      );

    this.scene.environment =
      pmrem.fromScene(
        new this.RoomEnvironment(),
        0.04
      ).texture;

    const ambient =
      new THREE.AmbientLight(
        0x445066,
        0.55
      );

    this.scene.add(
      ambient
    );

    const key =
      new THREE.DirectionalLight(
        0xffdcb0,
        2.6
      );

    key.position.set(
      9,
      14,
      7
    );

    key.castShadow =
      true;

    key.shadow.mapSize.set(
      2048,
      2048
    );

    key.shadow.camera.left =
      -10;

    key.shadow.camera.right =
      10;

    key.shadow.camera.top =
      10;

    key.shadow.camera.bottom =
      -10;

    key.shadow.camera.near =
      1;

    key.shadow.camera.far =
      40;

    key.shadow.bias =
      -0.0015;

    this.scene.add(
      key
    );

    const rim =
      new THREE.PointLight(
        0x5f8fe0,
        0.9,
        40,
        2
      );

    rim.position.set(
      -10,
      8,
      -8
    );

    this.scene.add(
      rim
    );

    const fill =
      new THREE.SpotLight(
        0xffffff,
        0.4,
        30,
        Math.PI / 5,
        0.6
      );

    fill.position.set(
      0,
      16,
      0
    );

    this.scene.add(
      fill
    );
  }


  _initPhysics() {

    const CANNON =
      this.CANNON;

    this.world =
      new CANNON.World({
        gravity:
          new CANNON.Vec3(
            0,
            -9.82,
            0
          )
      });

    this.world.broadphase =
      new CANNON.SAPBroadphase(
        this.world
      );

    this.world.allowSleep =
      true;

    this.world.solver.iterations =
      16;

    const cfg =
      DIFFICULTY[
        this.difficulty
      ];

    this.physMaterial =
      new CANNON.Material(
        'wood'
      );

    this.tableMaterial =
      new CANNON.Material(
        'table'
      );

    this.contact =
      new CANNON.ContactMaterial(
        this.physMaterial,
        this.physMaterial,
        {
          friction:
            cfg.friction,

          restitution:
            cfg.restitution,

          contactEquationStiffness:
            5e7,

          contactEquationRelaxation:
            3
        }
      );

    this.tableContact =
      new CANNON.ContactMaterial(
        this.physMaterial,
        this.tableMaterial,
        {
          friction:
            cfg.friction * 1.1,

          restitution:
            0.04,

          contactEquationStiffness:
            5e7
        }
      );

    this.world.addContactMaterial(
      this.contact
    );

    this.world.addContactMaterial(
      this.tableContact
    );
  }


  _buildEnvironment() {

    const THREE =
      this.THREE;

    const CANNON =
      this.CANNON;

    this.woodMat =
      new THREE.MeshStandardMaterial({
        color: 0xc48a4f,
        roughness: 0.72,
        metalness: 0.04
      });

    this.woodMat.map =
      this._makeWoodTexture(
        '#caa06a',
        '#7a4f28'
      );

    this.woodMat.roughnessMap =
      this.woodMat.map;


    const tableGeo =
      new THREE.BoxGeometry(
        9,
        0.5,
        9
      );

    const tableTex =
      this._makeWoodTexture(
        '#6b4326',
        '#3a2513',
        6
      );

    const tableMat =
      new THREE.MeshStandardMaterial({
        color: 0x5a3a20,
        map: tableTex,
        roughness: 0.55,
        metalness: 0.08
      });

    this.tableMesh =
      new THREE.Mesh(
        tableGeo,
        tableMat
      );

    this.tableMesh.position.set(
      0,
      -0.25,
      0
    );

    this.tableMesh.receiveShadow =
      true;

    this.tableMesh.castShadow =
      false;

    this.scene.add(
      this.tableMesh
    );


    const tableShape =
      new CANNON.Box(
        new CANNON.Vec3(
          4.5,
          0.25,
          4.5
        )
      );

    this.tableBody =
      new CANNON.Body({
        mass: 0,
        shape: tableShape,
        material:
          this.tableMaterial,

        position:
          new CANNON.Vec3(
            0,
            -0.25,
            0
          )
      });

    this.world.addBody(
      this.tableBody
    );


    const floorGeo =
      new THREE.PlaneGeometry(
        80,
        80
      );

    const floorMat =
      new THREE.MeshStandardMaterial({
        color: 0x0a0b10,
        roughness: 0.85,
        metalness: 0.15
      });

    const floor =
      new THREE.Mesh(
        floorGeo,
        floorMat
      );

    floor.rotation.x =
      -Math.PI / 2;

    floor.position.y =
      -3.2;

    floor.receiveShadow =
      true;

    this.scene.add(
      floor
    );


    const discGeo =
      new THREE.CircleGeometry(
        6.5,
        48
      );

    const discMat =
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.28
      });

    const disc =
      new THREE.Mesh(
        discGeo,
        discMat
      );

    disc.rotation.x =
      -Math.PI / 2;

    disc.position.y =
      -3.18;

    this.scene.add(
      disc
    );
  }


  _makeWoodTexture(
    base,
    grain,
    repeatY = 1
  ) {

    const THREE =
      this.THREE;

    const c =
      document.createElement(
        'canvas'
      );

    c.width = 256;
    c.height = 256;

    const ctx =
      c.getContext('2d');

    ctx.fillStyle =
      base;

    ctx.fillRect(
      0,
      0,
      256,
      256
    );

    for (
      let i = 0;
      i < 70;
      i++
    ) {

      const y =
        Math.random() * 256;

      ctx.strokeStyle =
        grain;

      ctx.globalAlpha =
        0.06 +
        Math.random() * 0.18;

      ctx.lineWidth =
        0.6 +
        Math.random() * 2;

      ctx.beginPath();

      ctx.moveTo(
        0,
        y +
          Math.sin(0) * 4
      );

      for (
        let x = 0;
        x <= 256;
        x += 16
      ) {

        ctx.lineTo(
          x,
          y +
            Math.sin(
              x * 0.05 + i
            ) *
            6 *
            Math.random()
        );
      }

      ctx.stroke();
    }

    ctx.globalAlpha = 1;

    const tex =
      new THREE.CanvasTexture(c);

    tex.wrapS =
      tex.wrapT =
        THREE.RepeatWrapping;

    tex.repeat.set(
      1,
      repeatY
    );

    return tex;
  }


  _collisionSetup() {

    for (
      const b of this.tower.blocks
    ) {

      b.body.addEventListener(
        'collide',
        e => {

          const now =
            performance.now();

          const relV =
            e.contact
              ? Math.abs(
                  e.contact
                    .getImpactVelocityAlongNormal()
                )
              : 1;

          if (
            relV > 0.6 &&
            now -
              this.lastCollisionSoundT >
              70
          ) {

            this.lastCollisionSoundT =
              now;

            this.sound.knock(
              Math.min(
                2,
                relV / 2
              )
            );

            const p =
              b.mesh.position;

            this.particles.spawnBurst(
              p,
              4,
              0xcaa06a,
              0.6,
              1.2,
              [0.3, 0.6]
            );
          }
        }
      );
    }
  }


  /* ------------------------ local 2-player game ------------------------ */

  startGame() {

    this.sound.ensure();

    this.gameStarted =
      true;

    this.status =
      'PLAYING';

    this.timerRunning =
      true;

    this.startTime =
      performance.now();

    this.elapsed = 0;

    this.currentPlayerIndex =
      0;

    this.blockControlEnabled =
      true;

    this.ui.showStart(false);

    this._setPlayerTurn(0);
  }


  _setPlayerTurn(index) {

    if (
      this.status === 'GAME_OVER' ||
      this.status === 'COLLAPSING'
    ) {
      return;
    }

    this.currentPlayerIndex =
      index %
      this.players.length;

    this.turnRemaining =
      this.turnTimeLimit;

    this.turnTimerRunning =
      true;

    const player =
      this.players[
        this.currentPlayerIndex
      ];

    this.blockControlEnabled =
      true;

    this.ui.renderPlayers(
      this.players,
      this.currentPlayerIndex
    );

    this.ui.showTurn(
      player.name,
      this.turnRemaining
    );

    this.ui.setBanner(
      `${player.name}'s Turn`,
      'ok'
    );
  }


  _nextPlayer() {

    if (
      this.status === 'GAME_OVER' ||
      this.status === 'COLLAPSING'
    ) {
      return;
    }

    this._setPlayerTurn(
      (
        this.currentPlayerIndex +
        1
      ) %
      this.players.length
    );
  }


  _turnExpired() {

    if (
      !this.turnTimerRunning
    ) {
      return;
    }

    this.turnTimerRunning =
      false;

    const player =
      this.players[
        this.currentPlayerIndex
      ];

    this.ui.setBanner(
      `${player.name} ran out of time`,
      'warning'
    );

    setTimeout(
      () => {

        if (
          this.status !== 'GAME_OVER' &&
          this.status !== 'COLLAPSING'
        ) {
          this._nextPlayer();
        }

      },
      500
    );
  }


  forfeitCurrentPlayer() {

    if (
      !this.gameStarted ||
      this.status === 'GAME_OVER' ||
      this.status === 'COLLAPSING'
    ) {
      return;
    }

    const player =
      this.players[
        this.currentPlayerIndex
      ];

    this._enterGameOver(
      'FORFEIT',
      player.name
    );
  }


  /* ------------------------------ input ------------------------------ */

  _bindInput() {

    const dom =
      this.renderer.domElement;

    this.raycaster =
      new this.THREE.Raycaster();

    this.pointerNDC =
      new this.THREE.Vector2();

    dom.addEventListener(
      'pointerdown',
      e => this._onPointerDown(e)
    );

    dom.addEventListener(
      'pointermove',
      e => this._onPointerMove(e)
    );

    window.addEventListener(
      'pointerup',
      e => this._onPointerUp(e)
    );

    dom.addEventListener(
      'contextmenu',
      e => e.preventDefault()
    );
  }


  _toNDC(e) {

    const rect =
      this.renderer.domElement
        .getBoundingClientRect();

    this.pointerNDC.x =
      (
        (e.clientX - rect.left) /
        rect.width
      ) *
      2 -
      1;

    this.pointerNDC.y =
      -(
        (e.clientY - rect.top) /
        rect.height
      ) *
      2 +
      1;
  }


  _pickBlock(e) {

    this._toNDC(e);

    this.raycaster.setFromCamera(
      this.pointerNDC,
      this.camera
    );

    const meshes =
      this.tower.activeBlocks
        .map(
          b => b.mesh
        );

    const hits =
      this.raycaster.intersectObjects(
        meshes,
        false
      );

    if (
      hits.length === 0
    ) {
      return null;
    }

    return hits[0]
      .object
      .userData
      .blockRef;
  }


  _onPointerDown(e) {

    this.sound.ensure();

    if (e.button === 2) {
      return;
    }

    if (e.button !== 0) {
      return;
    }

    if (
      this.status === 'GAME_OVER' ||
      this.status === 'COLLAPSING'
    ) {
      return;
    }

    if (
      !this.gameStarted ||
      !this.blockControlEnabled
    ) {
      return;
    }

    const block =
      this._pickBlock(e);

    if (
      block &&
      this.blockControlEnabled
    ) {

      this.dragCandidate =
        block;

      this.dragStartScreen = {
        x: e.clientX,
        y: e.clientY
      };

      this._toNDC(e);

      this.raycaster.setFromCamera(
        this.pointerNDC,
        this.camera
      );

      const hitPoint =
        this.raycaster
          .intersectObject(
            block.mesh,
            false
          )[0]?.point;

      this.dragPlaneNormal =
        this.camera
          .getWorldDirection(
            new this.THREE.Vector3()
          )
          .clone()
          .negate();

      this.dragPlane =
        new this.THREE.Plane()
          .setFromNormalAndCoplanarPoint(
            this.dragPlaneNormal
              .clone()
              .negate(),
            hitPoint ||
              block.mesh.position
          );

      this.dragStartWorld =
        hitPoint
          ? hitPoint.clone()
          : block.mesh.position.clone();

      this.dragOriginPos =
        block.mesh.position.clone();

      this.dragAxis =
        block.pullAxisWorld();

      this.dragging =
        false;

      this.isDraggingBlock =
        true;

      this.camCtrl.controls.enabled =
        false;

      this.activePointerId =
        e.pointerId;

      try {

        this.renderer
          .domElement
          .setPointerCapture(
            e.pointerId
          );

      } catch (err) {}

      this._selectBlock(
        block,
        false
      );

    } else if (
      block &&
      !this.blockControlEnabled
    ) {

      this.dragCandidate =
        null;

      this._selectBlock(
        block,
        false
      );

    } else {

      this.dragCandidate =
        null;
    }
  }


  _onPointerMove(e) {

    if (
      !this.dragCandidate ||
      !this.isDraggingBlock
    ) {
      return;
    }

    const dx =
      e.clientX -
      this.dragStartScreen.x;

    const dy =
      e.clientY -
      this.dragStartScreen.y;

    const dist =
      Math.hypot(
        dx,
        dy
      );

    if (
      !this.dragging &&
      dist > 6
    ) {

      this.dragging =
        true;

      this.sound.startScrape();
    }

    if (!this.dragging) {
      return;
    }

    if (
      this.status === 'START'
    ) {
      this._beginPlaying();
    }

    this._toNDC(e);

    this.raycaster.setFromCamera(
      this.pointerNDC,
      this.camera
    );

    const pt =
      new this.THREE.Vector3();

    const hit =
      this.raycaster.ray
        .intersectPlane(
          this.dragPlane,
          pt
        );

    if (!hit) {
      return;
    }

    const worldDelta =
      pt
        .clone()
        .sub(this.dragStartWorld);

    const scalar =
      worldDelta.dot(
        this.dragAxis
      );

    const maxPull =
      BLOCK_LEN * 1.05;

    this.dragTargetExtra =
      this.THREE.MathUtils.clamp(
        scalar,
        -0.2,
        maxPull
      );

    const newPos =
      this.dragOriginPos
        .clone()
        .add(
          this.dragAxis
            .clone()
            .multiplyScalar(
              this.dragTargetExtra
            )
        );

    this.dragCandidate.mesh
      .position
      .copy(newPos);

    if (
      this.dragCandidate.body
    ) {

      this.dragCandidate.body
        .position
        .copy(newPos);

      this.dragCandidate.body
        .velocity
        .setZero();

      this.dragCandidate.body
        .angularVelocity
        .setZero();
    }
  }


  _onPointerUp(e) {

    if (
      this.activePointerId !== null
    ) {

      try {

        this.renderer
          .domElement
          .releasePointerCapture(
            this.activePointerId
          );

      } catch (err) {}

      this.activePointerId =
        null;
    }

    if (
      this.dragCandidate &&
      this.isDraggingBlock &&
      this.dragging
    ) {

      this.sound.stopScrape();

      const block =
        this.dragCandidate;

      const extraction =
        block.extractionAmount();

      if (
        extraction >
        BLOCK_LEN *
          EXTRACT_RATIO
      ) {

        this._removeBlock(
          block
        );
      }
    }

    this.isDraggingBlock =
      false;

    this.camCtrl.controls.enabled =
      true;

    this.dragCandidate =
      null;

    this.dragging =
      false;
  }


  _selectById(id) {

    const block =
      this.tower.blocks.find(
        b => b.id === id
      );

    if (
      !block ||
      block.removed
    ) {
      return;
    }

    this._selectBlock(
      block,
      true
    );
  }


  _selectBlock(
    block,
    fromGrid
  ) {

    if (
      this.selectedBlock &&
      this.selectedBlock !== block
    ) {

      this.selectedBlock
        .setHighlight(false);
    }

    this.selectedBlock =
      block;

    block.setHighlight(
      true
    );

    this.sound.click();

    this.ui.showBlockInfo(
      block
    );

    this.ui.refreshGrid(
      this.tower.blocks
    );
  }


  /* ------------------------------ flow ------------------------------ */

  _beginPlaying() {

    if (
      this.status === 'START'
    ) {

      this.status =
        'PLAYING';

      this.timerRunning =
        true;

      this.startTime =
        performance.now() -
        this.elapsed;
    }
  }


  _removeBlock(block) {

    block.removed =
      true;

    this.tower.removedCount++;

    this.moves++;

    this._beginPlaying();

    this.selectedBlock =
      null;

    block.setHighlight(
      false
    );

    this.particles.spawnBurst(
      block.mesh.position,
      10,
      0xd9c39a,
      1.1,
      2.0,
      [0.4, 0.9]
    );

    this.sound.knock(
      1.2
    );

    this.history.unshift({
      n: this.moves,
      text:
        `Removed Block ${block.id}`
    });

    if (
      this.history.length > 5
    ) {
      this.history.pop();
    }

    this.ui.pushHistory(
      this.history
    );

    this.ui.hideBlockInfo();

    this.ui.refreshGrid(
      this.tower.blocks
    );

    if (
      !this.victoryShown &&
      this.tower.removedCount >=
        WIN_TARGET &&
      this.status !==
        'COLLAPSING' &&
      this.status !==
        'GAME_OVER'
    ) {

      this.victoryShown =
        true;

      this.status =
        'VICTORY_FLAG';

      this.ui.showVictory(
        `${WIN_TARGET} blocks removed without a collapse!`
      );

      this.status =
        'PLAYING';
    }

    if (
      this.gameStarted &&
      this.status !==
        'COLLAPSING' &&
      this.status !==
        'GAME_OVER'
    ) {

      this.turnTimerRunning =
        false;

      setTimeout(
        () => this._nextPlayer(),
        700
      );
    }
  }


  setDifficulty(d) {

    this.difficulty =
      d;

    this.reset();
  }


  reset() {

    const cfg =
      DIFFICULTY[
        this.difficulty
      ];

    this.contact.friction =
      cfg.friction;

    this.contact.restitution =
      cfg.restitution;

    this.tableContact.friction =
      cfg.friction * 1.1;

    this.tower.reset();

    for (
      const b of this.tower.blocks
    ) {

      b.body.linearDamping =
        cfg.linDamp;

      b.body.angularDamping =
        cfg.angDamp;
    }

    this._collisionSetup();

    this.status =
      'START';

    this.gameStarted =
      false;

    this.turnTimerRunning =
      false;

    this.turnRemaining =
      this.turnTimeLimit;

    this.currentPlayerIndex =
      0;

    this.blockControlEnabled =
      true;

    this.moves =
      0;

    this.elapsed =
      0;

    this.startTime =
      null;

    this.timerRunning =
      false;

    this.history =
      [];

    this.selectedBlock =
      null;

    this.dragCandidate =
      null;

    this.dragging =
      false;

    this.isDraggingBlock =
      false;

    this.activePointerId =
      null;

    this.camCtrl.controls.enabled =
      true;

    this.collapseSettleTimer =
      0;

    this.victoryShown =
      false;

    this.sound.stopRumble();
    this.sound.stopScrape();

    this.ui.hideGameOver();

    this.ui.hideBlockInfo();

    this.ui.hideTurn();

    this.ui.showStart(true);

    this.ui.renderPlayers(
      this.players,
      this.currentPlayerIndex
    );

    this.ui.pushHistory([]);

    this.ui.refreshGrid(
      this.tower.blocks
    );

    this.ui.setBanner(
      'Ready',
      'ok'
    );

    this.ui.updateGameInfo({
      moves: 0,
      timeStr: '00:00',
      remaining:
        TOTAL_BLOCKS,
      total:
        TOTAL_BLOCKS,
      statusLabel:
        'READY'
    });

    this.camCtrl.target.copy(
      this.tower.center()
    );

    this.camCtrl.resetView();
  }


  _fmtTime(ms) {

    const s =
      Math.floor(
        ms / 1000
      );

    const mm =
      String(
        Math.floor(
          s / 60
        )
      ).padStart(
        2,
        '0'
      );

    const ss =
      String(
        s % 60
      ).padStart(
        2,
        '0'
      );

    return `${mm}:${ss}`;
  }


  /* --------------------------- main loop --------------------------- */

  _loop() {

    this._raf =
      requestAnimationFrame(
        () => this._loop()
      );

    const dt =
      Math.min(
        0.033,
        this.clock.getDelta()
      );

    this.frameCount++;


    if (
      this.dragging &&
      this.dragCandidate &&
      !this.dragCandidate.removed
    ) {

      const b =
        this.dragCandidate;

      const axis =
        this.dragAxis;

      const targetPos =
        this.dragOriginPos
          .clone()
          .addScaledVector(
            axis,
            this.dragTargetExtra
          );

      const cur =
        b.body.position;

      const curV =
        new this.THREE.Vector3(
          cur.x,
          cur.y,
          cur.z
        );

      const toTarget =
        targetPos
          .clone()
          .sub(curV);

      const alongAxis =
        axis
          .clone()
          .multiplyScalar(
            toTarget.dot(axis)
          );

      const stiffness =
        9.0;

      b.body.velocity.x +=
        alongAxis.x *
        stiffness *
        dt *
        60 *
        dt;

      b.body.velocity.y +=
        alongAxis.y *
        stiffness *
        dt *
        60 *
        dt *
        0.5;

      b.body.velocity.z +=
        alongAxis.z *
        stiffness *
        dt *
        60 *
        dt;

      const vel =
        new this.THREE.Vector3(
          b.body.velocity.x,
          b.body.velocity.y,
          b.body.velocity.z
        );

      const along =
        axis
          .clone()
          .multiplyScalar(
            vel.dot(axis)
          );

      const lateral =
        vel
          .clone()
          .sub(along);

      lateral.multiplyScalar(
        0.82
      );

      const newVel =
        along.add(
          lateral
        );

      b.body.velocity.set(
        newVel.x,
        newVel.y,
        newVel.z
      );

      b.body.wakeUp();
    }


    this.world.step(
      1 / 60,
      dt,
      5
    );


    for (
      const b of this.tower.blocks
    ) {

      b.syncMeshFromBody();
    }


    this.particles.update(
      dt
    );


    if (
      this.timerRunning
    ) {

      this.elapsed =
        performance.now() -
        this.startTime;
    }


    if (
      this.turnTimerRunning &&
      this.gameStarted &&
      this.status !==
        'GAME_OVER' &&
      this.status !==
        'COLLAPSING'
    ) {

      this.turnRemaining =
        Math.max(
          0,
          this.turnRemaining -
            dt
        );

      this.ui.showTurn(
        this.players[
          this.currentPlayerIndex
        ].name,
        this.turnRemaining
      );

      if (
        this.turnRemaining <= 0
      ) {

        this._turnExpired();
      }
    }


    if (
      this.frameCount % 3 === 0
    ) {

      this._evaluateStability();
    }


    if (
      this.selectedBlock
    ) {

      this.ui.showBlockInfo(
        this.selectedBlock
      );
    }


    this.ui.updateGameInfo({
      moves:
        this.moves,

      timeStr:
        this._fmtTime(
          this.elapsed
        ),

      remaining:
        TOTAL_BLOCKS -
        this.tower.removedCount,

      total:
        TOTAL_BLOCKS,

      statusLabel:
        this._statusLabel()
    });


    this.camCtrl.update(
      dt
    );

    this.renderer.render(
      this.scene,
      this.camera
    );
  }


  _statusLabel() {

    switch (
      this.status
    ) {

      case 'START':
        return 'READY';

      case 'PLAYING':
        return 'STABLE';

      case 'WARNING':
        return 'UNSTABLE';

      case 'COLLAPSING':
        return 'FALLING';

      case 'GAME_OVER':
        return 'COLLAPSED';

      default:
        return 'STABLE';
    }
  }


  _evaluateStability() {

    const sens =
      DIFFICULTY[
        this.difficulty
      ].sensitivity;

    const s =
      this.tower.computeStability(
        sens
      );

    let riskLabel =
      'LOW';

    let riskClass =
      'ok';

    if (
      s.score < 40
    ) {

      riskLabel =
        'HIGH';

      riskClass =
        'danger';

    } else if (
      s.score < 75
    ) {

      riskLabel =
        'MEDIUM';

      riskClass =
        'warn';
    }


    const comFrac =
      s.supportHalfX
        ? 0.5 +
          (
            s.comX -
            (s.cx || 0)
          ) /
            (
              s.supportHalfX *
              2.4
            )
        : 0.5;


    const comLabel =
      s.comOffset > 0.15
        ? (
            s.comX >
            (s.cx || 0)
              ? 'Shifted Right'
              : 'Shifted Left'
          )
        : 'Centered';


    this.ui.updatePhysics({
      comLabel,
      comFrac,
      stabScore:
        s.score,
      tiltDeg:
        s.tiltDeg,
      riskLabel,
      riskClass
    });


    if (
      this.status === 'PLAYING' ||
      this.status === 'WARNING'
    ) {

      const wasWarning =
        this.status ===
        'WARNING';


      if (
        s.score < 42 &&
        s.energy > 0.05
      ) {

        this.status =
          'WARNING';

        this.ui.setBanner(
          'Tower Unstable',
          'warning'
        );

        if (!wasWarning) {

          this.sound.startRumble();
        }

      } else if (
        this.status ===
        'WARNING'
      ) {

        this.status =
          'PLAYING';

        this.ui.setBanner(
          'Stable',
          'ok'
        );

        this.sound.stopRumble();

      } else {

        this.ui.setBanner(
          'Stable',
          'ok'
        );
      }


      const collapseThreshold =
        0.55 / sens;


      if (
        (
          s.tiltDeg > 11 ||
          s.score < 14
        ) &&
        s.energy >
          collapseThreshold
      ) {

        this.status =
          'COLLAPSING';

        this.collapseSettleTimer =
          0;

        this.ui.setBanner(
          'Tower Falling',
          'danger'
        );

        this.sound.stopRumble();

        this.sound.crash();

        this.particles.spawnBurst(
          s.com,
          60,
          0xc9a06a,
          2.2,
          4,
          [0.6, 1.4]
        );

        this.camCtrl.controls.enabled =
          true;
      }

    } else if (
      this.status ===
      'COLLAPSING'
    ) {

      if (
        s.energy < 0.02
      ) {

        this.collapseSettleTimer +=
          3 / 60;

        if (
          this.collapseSettleTimer >
          1.4
        ) {

          this._enterGameOver();
        }

      } else {

        this.collapseSettleTimer =
          0;
      }
    }
  }


  _enterGameOver(
    reason = 'COLLAPSED',
    forfeitingPlayer = null
  ) {

    this.status =
      'GAME_OVER';

    this.timerRunning =
      false;

    this.turnTimerRunning =
      false;

    const lostByForfeit =
      reason === 'FORFEIT';

    this.ui.setBanner(
      lostByForfeit
        ? 'GAME LOST'
        : 'Tower Collapsed',
      'danger'
    );


    if (
      this.bestMoves === null ||
      this.moves >
        this.bestMoves
    ) {

      this.bestMoves =
        this.moves;
    }


    if (
      lostByForfeit
    ) {

      this.ui.el.goTitle
        .textContent =
        'GAME LOST';

      this.ui.el.goSub
        .textContent =
        `${
          forfeitingPlayer ||
          'Current player'
        } forfeited.`;

    } else {

      this.ui.el.goTitle
        .textContent =
        'TOWER COLLAPSED';

      this.ui.el.goSub
        .textContent =
        'The tower gave way.';
    }


    this.ui.showGameOver({
      moves:
        this.moves,

      timeStr:
        this._fmtTime(
          this.elapsed
        ),

      best:
        this.bestMoves
    });
  }


  _onResize() {

    const host =
      document.getElementById(
        'canvas-host'
      );

    this.camera.aspect =
      host.clientWidth /
      host.clientHeight;

    this.camera.updateProjectionMatrix();

    this.renderer.setSize(
      host.clientWidth,
      host.clientHeight
    );
  }
}


boot();
