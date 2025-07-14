// Game variables
let scene, camera, renderer, controls;
let socket;
let players = new Map();
let bullets = new Map();
let world = {};
let collidableObjects = []; // Array to store collidable objects
let gameStarted = false;
let isPointerLocked = false;

// Player state
let playerHealth = 100;
let playerAmmo = 16;
let maxAmmo = 16;
let isReloading = false;
let canShoot = true;

// Movement
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let velocity = new THREE.Vector3();
const MOVE_SPEED = 2.5; // Further reduced from 5 to 2.5
const WORLD_SIZE = 50;

// Camera rotation variables for Minecraft-like movement
let yaw = 0; // Horizontal rotation
let pitch = 0; // Vertical rotation
const maxPitch = Math.PI / 2 - 0.01; // Prevent looking too far up/down

// DOM elements
const ammoCounter = document.getElementById('ammoCount');
const healthFill = document.getElementById('healthFill');
const reloadIndicator = document.getElementById('reloadIndicator');
const instructions = document.getElementById('instructions');
const playerCount = document.getElementById('playerCount');
const gameContainer = document.getElementById('gameContainer');

// Initialize the game
function init() {
    // Create scene
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x87CEEB, 10, 100);

    // Create camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.8, 0);
    
    // Initialize camera rotation for Minecraft-style movement
    camera.rotation.order = 'YXZ';
    yaw = 0;
    pitch = 0;

    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x87CEEB);
    gameContainer.appendChild(renderer.domElement);

    // Create world
    createWorld();
    
    // Setup controls
    setupControls();
    
    // Connect to server
    connectToServer();
    
    // Setup event listeners
    setupEventListeners();
    
    // Start render loop
    animate();
}

function createWorld() {
    // Ground
    const groundGeometry = new THREE.PlaneGeometry(WORLD_SIZE * 2, WORLD_SIZE * 2);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x90EE90 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Invisible walls (boundaries)
    const wallHeight = 10;
    const wallGeometry = new THREE.BoxGeometry(1, wallHeight, WORLD_SIZE * 2);
    const invisibleMaterial = new THREE.MeshBasicMaterial({ 
        transparent: true, 
        opacity: 0 
    });

    // Create boundary walls
    const walls = [
        { x: WORLD_SIZE, z: 0 },   // Right wall
        { x: -WORLD_SIZE, z: 0 },  // Left wall
        { x: 0, z: WORLD_SIZE },   // Back wall
        { x: 0, z: -WORLD_SIZE }   // Front wall
    ];

    walls.forEach(wall => {
        const wallMesh = new THREE.Mesh(wallGeometry, invisibleMaterial);
        wallMesh.position.set(wall.x, wallHeight / 2, wall.z);
        if (wall.z !== 0) {
            wallMesh.rotation.y = Math.PI / 2;
        }
        scene.add(wallMesh);
        world[`wall_${wall.x}_${wall.z}`] = wallMesh;
    });

    // House
    createHouse();
    
    // Trees
    createTrees();
    
    // Cover walls
    createCoverWalls();
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 50, 25);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -50;
    directionalLight.shadow.camera.right = 50;
    directionalLight.shadow.camera.top = 50;
    directionalLight.shadow.camera.bottom = -50;
    scene.add(directionalLight);
}

function createHouse() {
    const houseGroup = new THREE.Group();
    
    // First floor
    const firstFloorGeometry = new THREE.BoxGeometry(8, 3, 8);
    const houseMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
    const firstFloor = new THREE.Mesh(firstFloorGeometry, houseMaterial);
    firstFloor.position.set(15, 1.5, 15);
    firstFloor.castShadow = true;
    firstFloor.receiveShadow = true;
    houseGroup.add(firstFloor);
    
    // Add collision box for first floor - but with a doorway
    // Split the first floor collision into multiple boxes to create a doorway
    collidableObjects.push({
        position: { x: 13, y: 1.5, z: 15 }, // Left part of house
        size: { x: 4, y: 3, z: 8 }
    });
    collidableObjects.push({
        position: { x: 17, y: 1.5, z: 15 }, // Right part of house  
        size: { x: 4, y: 3, z: 8 }
    });
    collidableObjects.push({
        position: { x: 15, y: 1.5, z: 13 }, // Back part of house
        size: { x: 2, y: 3, z: 4 }
    });
    // Add door collision when closed - will be managed by door state
    const doorCollision = {
        position: { x: 15, y: 1.1, z: 19.1 },
        size: { x: 1.8, y: 2.2, z: 0.1 },
        isDoor: true
    };
    collidableObjects.push(doorCollision);
    world.doorCollision = doorCollision;

    // Second floor
    const secondFloorGeometry = new THREE.BoxGeometry(8, 3, 8);
    const secondFloor = new THREE.Mesh(secondFloorGeometry, houseMaterial);
    secondFloor.position.set(15, 4.5, 15);
    secondFloor.castShadow = true;
    secondFloor.receiveShadow = true;
    houseGroup.add(secondFloor);
    
    // Add collision box for second floor
    collidableObjects.push({
        position: { x: 15, y: 4.5, z: 15 },
        size: { x: 8, y: 3, z: 8 }
    });

    // Roof
    const roofGeometry = new THREE.ConeGeometry(6, 2, 4);
    const roofMaterial = new THREE.MeshLambertMaterial({ color: 0x654321 });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.set(15, 7, 15);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    houseGroup.add(roof);

    // Windows on second floor (large for shooting)
    const windowGeometry = new THREE.PlaneGeometry(2, 1.5);
    const windowMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x87CEEB, 
        transparent: true, 
        opacity: 0.3 
    });

    // Front window
    const frontWindow = new THREE.Mesh(windowGeometry, windowMaterial);
    frontWindow.position.set(15, 4.5, 11.1);
    houseGroup.add(frontWindow);

    // Back window
    const backWindow = new THREE.Mesh(windowGeometry, windowMaterial);
    backWindow.position.set(15, 4.5, 18.9);
    backWindow.rotation.y = Math.PI;
    houseGroup.add(backWindow);

    // Side windows
    const leftWindow = new THREE.Mesh(windowGeometry, windowMaterial);
    leftWindow.position.set(11.1, 4.5, 15);
    leftWindow.rotation.y = Math.PI / 2;
    houseGroup.add(leftWindow);

    const rightWindow = new THREE.Mesh(windowGeometry, windowMaterial);
    rightWindow.position.set(18.9, 4.5, 15);
    rightWindow.rotation.y = -Math.PI / 2;
    houseGroup.add(rightWindow);

    // Door frame (visual indication of entrance)
    const doorFrameGeometry = new THREE.BoxGeometry(2.2, 2.5, 0.3);
    const doorFrameMaterial = new THREE.MeshLambertMaterial({ color: 0x654321 });
    const doorFrame = new THREE.Mesh(doorFrameGeometry, doorFrameMaterial);
    doorFrame.position.set(15, 1.25, 19.15); // Front of house
    doorFrame.castShadow = true;
    houseGroup.add(doorFrame);
    
    // Actual door that can be opened/closed
    const doorGeometry = new THREE.BoxGeometry(1.8, 2.2, 0.1);
    const doorMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
    const doorMesh = new THREE.Mesh(doorGeometry, doorMaterial);
    doorMesh.position.set(15, 1.1, 19.1);
    doorMesh.castShadow = true;
    doorMesh.userData = { 
        isDoor: true, 
        isOpen: false, 
        originalPosition: { x: 15, y: 1.1, z: 19.1 },
        openPosition: { x: 16.5, y: 1.1, z: 19.1 }
    };
    houseGroup.add(doorMesh);
    world.door = doorMesh;

    // Internal ladder leading to second floor
    const internalLadderGroup = new THREE.Group();
    
    // Ladder rails (vertical supports) - positioned inside house
    const internalRailGeometry = new THREE.BoxGeometry(0.1, 4.5, 0.1);
    const internalRailMaterial = new THREE.MeshLambertMaterial({ color: 0x654321 });
    
    const internalLeftRail = new THREE.Mesh(internalRailGeometry, internalRailMaterial);
    internalLeftRail.position.set(12.5, 2.25, 17);
    internalLeftRail.castShadow = true;
    internalLadderGroup.add(internalLeftRail);
    
    const internalRightRail = new THREE.Mesh(internalRailGeometry, internalRailMaterial);
    internalRightRail.position.set(13.2, 2.25, 17);
    internalRightRail.castShadow = true;
    internalLadderGroup.add(internalRightRail);
    
    // Ladder rungs (horizontal steps)
    const rungGeometry = new THREE.BoxGeometry(0.8, 0.05, 0.1);
    const rungMaterial = new THREE.MeshLambertMaterial({ color: 0x654321 });
    
    for (let i = 0; i < 12; i++) {
        const rung = new THREE.Mesh(rungGeometry, rungMaterial);
        rung.position.set(12.85, 0.5 + i * 0.35, 17);
        rung.castShadow = true;
        internalLadderGroup.add(rung);
    }
    
    // Add internal ladder to house group
    houseGroup.add(internalLadderGroup);
    world.ladder = internalLadderGroup;

    scene.add(houseGroup);
    world.house = houseGroup;
}

function createTrees() {
    const treePositions = [
        { x: -20, z: -20 },
        { x: -15, z: 20 },
        { x: 25, z: -15 },
        { x: -25, z: 10 },
        { x: 20, z: 25 },
        { x: -10, z: -25 },
        { x: 30, z: 5 },
        { x: -30, z: -10 }
    ];

    treePositions.forEach((pos, index) => {
        const treeGroup = new THREE.Group();
        
        // Trunk
        const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.5, 4);
        const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.set(0, 2, 0);
        trunk.castShadow = true;
        treeGroup.add(trunk);

        // Leaves
        const leavesGeometry = new THREE.SphereGeometry(2);
        const leavesMaterial = new THREE.MeshLambertMaterial({ color: 0x228B22 });
        const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
        leaves.position.set(0, 5, 0);
        leaves.castShadow = true;
        treeGroup.add(leaves);

        treeGroup.position.set(pos.x, 0, pos.z);
        scene.add(treeGroup);
        world[`tree_${index}`] = treeGroup;
        
        // Add collision box for tree trunk
        collidableObjects.push({
            position: { x: pos.x, y: 2, z: pos.z },
            size: { x: 1, y: 4, z: 1 }
        });
    });
}

function createCoverWalls() {
    const wallPositions = [
        // Original walls - made higher
        { x: 0, z: -10, width: 6, height: 3, depth: 0.8 },
        { x: -15, z: 0, width: 3, height: 3, depth: 0.8 },
        { x: 10, z: -5, width: 4, height: 3, depth: 0.8 },
        { x: -5, z: 20, width: 4, height: 3, depth: 0.8 },
        
        // Additional cover walls for better tactical gameplay
        { x: -25, z: -15, width: 5, height: 3.5, depth: 0.8 },
        { x: 25, z: 10, width: 3, height: 3.5, depth: 0.8 },
        { x: -8, z: -20, width: 4, height: 3, depth: 0.8 },
        { x: 18, z: -18, width: 6, height: 3, depth: 0.8 },
        { x: -20, z: 15, width: 4, height: 3.5, depth: 0.8 },
        { x: 8, z: 25, width: 5, height: 3, depth: 0.8 },
        
        // L-shaped corner covers
        { x: -12, z: -12, width: 2, height: 3.5, depth: 4 },
        { x: 22, z: 22, width: 2, height: 3.5, depth: 4 },
        { x: -22, z: 22, width: 4, height: 3.5, depth: 2 },
        { x: 12, z: -12, width: 4, height: 3.5, depth: 2 },
        
        // Some connecting walls for more complex cover
        { x: 5, z: 12, width: 8, height: 2.5, depth: 0.6 },
        { x: -18, z: -8, width: 6, height: 2.8, depth: 0.6 }
    ];

    wallPositions.forEach((wall, index) => {
        const wallGeometry = new THREE.BoxGeometry(wall.width, wall.height, wall.depth);
        const wallMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x696969,
            // Add some variation in color
            ...(Math.random() > 0.5 && { color: 0x808080 })
        });
        const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
        wallMesh.position.set(wall.x, wall.height / 2, wall.z);
        wallMesh.castShadow = true;
        wallMesh.receiveShadow = true;
        scene.add(wallMesh);
        world[`cover_${index}`] = wallMesh;
        
        // Add collision box for wall
        collidableObjects.push({
            position: { x: wall.x, y: wall.height / 2, z: wall.z },
            size: { x: wall.width, y: wall.height, z: wall.depth }
        });
    });
}

function setupControls() {
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('pointerlockerror', onPointerLockError);
}

function setupEventListeners() {
    // Click to start
    instructions.addEventListener('click', () => {
        if (!gameStarted) {
            gameContainer.requestPointerLock();
        }
    });

    // Keyboard events
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    
    // Mouse events
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mousedown', onMouseDown);
    
    // Window resize
    window.addEventListener('resize', onWindowResize);
}

function onPointerLockChange() {
    if (document.pointerLockElement === gameContainer) {
        isPointerLocked = true;
        gameStarted = true;
        instructions.classList.add('hidden');
    } else {
        isPointerLocked = false;
    }
}

function onPointerLockError() {
    console.error('Pointer lock error');
}

function onKeyDown(event) {
    if (!gameStarted) return;
    
    switch (event.code) {
        case 'KeyS':
            moveForward = true;
            break;
        case 'KeyW':
            moveBackward = true;
            break;
        case 'KeyA':
            moveLeft = true;
            break;
        case 'KeyD':
            moveRight = true;
            break;
        case 'KeyR':
            if (!isReloading && playerAmmo < maxAmmo) {
                socket.emit('reload');
            }
            break;
        case 'KeyE':
            // Door interaction
            if (checkDoorProximity()) {
                toggleDoor();
            }
            break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'KeyS':
            moveForward = false;
            break;
        case 'KeyW':
            moveBackward = false;
            break;
        case 'KeyA':
            moveLeft = false;
            break;
        case 'KeyD':
            moveRight = false;
            break;
    }
}

function onMouseMove(event) {
    if (!isPointerLocked) return;
    
    // Minecraft-style camera movement
    const sensitivity = 0.002;
    
    // Update yaw (horizontal) and pitch (vertical) separately
    yaw -= event.movementX * sensitivity;
    pitch -= event.movementY * sensitivity;
    
    // Clamp pitch to prevent over-rotation
    pitch = Math.max(-maxPitch, Math.min(maxPitch, pitch));
    
    // Apply rotations in the correct order (Y then X, no Z)
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
    camera.rotation.z = 0; // Always keep level
}

function onMouseDown(event) {
    if (!gameStarted || !isPointerLocked || event.button !== 0) return;
    
    if (canShoot && playerAmmo > 0 && !isReloading) {
        shoot();
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function shoot() {
    // Get shooting direction
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyQuaternion(camera.quaternion);
    
    // Muzzle position (slightly in front of camera)
    const muzzleOffset = direction.clone().multiplyScalar(0.5);
    const shootPos = camera.position.clone().add(muzzleOffset);
    
    socket.emit('shoot', {
        x: shootPos.x,
        y: shootPos.y,
        z: shootPos.z,
        dirX: direction.x,
        dirY: direction.y,
        dirZ: direction.z
    });
    
    // Rate limiting
    canShoot = false;
    setTimeout(() => { canShoot = true; }, 100);
}

// Collision detection function
function checkCollision(position, radius = 0.5) {
    for (const obj of collidableObjects) {
        // Skip door collision if door is open
        if (obj.isDoor && world.door && world.door.userData.isOpen) {
            continue;
        }
        
        const dx = Math.abs(position.x - obj.position.x);
        const dz = Math.abs(position.z - obj.position.z);
        const dy = Math.abs(position.y - obj.position.y);
        
        // Check if player is colliding with object (simple box collision)
        if (dx < (obj.size.x / 2 + radius) && 
            dz < (obj.size.z / 2 + radius) && 
            dy < (obj.size.y / 2 + 0.9)) { // Player height is about 1.8
            return true;
        }
    }
    return false;
}

// Door interaction function
function toggleDoor() {
    const door = world.door;
    if (!door) return;
    
    const userData = door.userData;
    if (userData.isOpen) {
        // Close door
        door.position.set(
            userData.originalPosition.x,
            userData.originalPosition.y,
            userData.originalPosition.z
        );
        door.rotation.y = 0;
        userData.isOpen = false;
    } else {
        // Open door (slide to the side)
        door.position.set(
            userData.openPosition.x,
            userData.openPosition.y,
            userData.openPosition.z
        );
        door.rotation.y = Math.PI / 2;
        userData.isOpen = true;
    }
}

// Check if player is near door for interaction
function checkDoorProximity() {
    if (!world.door) return false;
    
    const doorPos = world.door.position;
    const playerPos = camera.position;
    const distance = Math.sqrt(
        Math.pow(playerPos.x - doorPos.x, 2) +
        Math.pow(playerPos.z - doorPos.z, 2)
    );
    
    return distance < 3; // Within 3 units of door
}

function updateMovement(deltaTime) {
    if (!gameStarted) return;
    
    velocity.x -= velocity.x * 10.0 * deltaTime;
    velocity.z -= velocity.z * 10.0 * deltaTime;
    
    const moveSpeed = MOVE_SPEED * deltaTime;
    
    if (moveForward) velocity.z -= moveSpeed;
    if (moveBackward) velocity.z += moveSpeed;
    if (moveLeft) velocity.x -= moveSpeed;
    if (moveRight) velocity.x += moveSpeed;
    
    // Minecraft-style movement: forward/backward based on yaw, strafe left/right
    const forward = new THREE.Vector3(
        Math.sin(yaw),
        0,
        Math.cos(yaw)
    );
    
    const right = new THREE.Vector3(
        Math.cos(yaw),
        0,
        -Math.sin(yaw)
    );
    
    const moveVector = new THREE.Vector3();
    moveVector.addScaledVector(forward, -velocity.z);
    moveVector.addScaledVector(right, velocity.x);
    
    // Check collision before moving
    const newPosition = camera.position.clone().add(moveVector);
    
    // World boundary check
    if (Math.abs(newPosition.x) < WORLD_SIZE - 1 && Math.abs(newPosition.z) < WORLD_SIZE - 1) {
        // Collision check
        if (!checkCollision(newPosition)) {
            camera.position.add(moveVector);
            
            // Send position to server
            socket.emit('playerMove', {
                x: camera.position.x,
                y: camera.position.y,
                z: camera.position.z,
                rotationY: yaw
            });
        }
    }
}

function connectToServer() {
    socket = io();
    
    socket.on('gameInit', (data) => {
        console.log('Game initialized', data);
        
        // Add existing players
        data.players.forEach(player => {
            if (player.id !== socket.id) {
                addPlayer(player);
            }
        });
    });
    
    socket.on('playerJoined', (player) => {
        console.log('Player joined:', player.id);
        addPlayer(player);
    });
    
    socket.on('playerLeft', (playerId) => {
        console.log('Player left:', playerId);
        removePlayer(playerId);
    });
    
    socket.on('playerMoved', (data) => {
        updatePlayerPosition(data);
    });
    
    socket.on('playerCount', (count) => {
        playerCount.textContent = `Players: ${count}`;
    });
    
    socket.on('bulletFired', (data) => {
        createBullet(data);
    });
    
    socket.on('bulletExpired', (bulletId) => {
        removeBullet(bulletId);
    });
    
    socket.on('playerHit', (data) => {
        console.log('Player hit:', data);
        
        if (data.playerId === socket.id) {
            // I got hit - show red flash and update health
            playerHealth = data.health;
            updateHealthBar();
            showHitFlash();
        } else if (data.shooter === socket.id) {
            // I shot someone - show damage indicator
            const hitPlayer = players.get(data.playerId);
            if (hitPlayer) {
                const hitPosition = hitPlayer.position.clone();
                hitPosition.y += 1; // Show indicator above player
                showDamageIndicator(data.damage, hitPosition);
            }
        }
        
        // Flash the hit player red for everyone to see
        const hitPlayerMesh = players.get(data.playerId);
        if (hitPlayerMesh && data.playerId !== socket.id) {
            // Save original colors
            const originalColors = [];
            hitPlayerMesh.children.forEach((child, index) => {
                if (child.material && child.material.color) {
                    originalColors[index] = child.material.color.clone();
                    child.material.color.setHex(0xff0000); // Red
                }
            });
            
            // Restore original colors after flash
            setTimeout(() => {
                hitPlayerMesh.children.forEach((child, index) => {
                    if (child.material && originalColors[index]) {
                        child.material.color.copy(originalColors[index]);
                    }
                });
            }, 200);
        }
    });
    
    socket.on('ammoUpdate', (ammo) => {
        playerAmmo = ammo;
        updateAmmoDisplay();
    });
    
    socket.on('reloadStarted', () => {
        isReloading = true;
        reloadIndicator.style.display = 'block';
    });
    
    socket.on('reloadComplete', () => {
        isReloading = false;
        playerAmmo = maxAmmo;
        reloadIndicator.style.display = 'none';
        updateAmmoDisplay();
    });
    
    socket.on('playerRespawned', (data) => {
        if (data.id === socket.id) {
            playerHealth = 100;
            updateHealthBar();
            camera.position.set(data.x, data.y, data.z);
        } else {
            updatePlayerPosition(data);
        }
    });
}

function addPlayer(player) {
    if (players.has(player.id)) return;
    
    // Create player representation - a more visible character model
    const playerGroup = new THREE.Group();
    
    // Body (capsule-like shape using cylinder + spheres)
    const bodyGeometry = new THREE.CylinderGeometry(0.3, 0.3, 1.2);
    const bodyMaterial = new THREE.MeshLambertMaterial({ 
        color: Math.random() * 0xffffff 
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.6;
    body.castShadow = true;
    playerGroup.add(body);
    
    // Head
    const headGeometry = new THREE.SphereGeometry(0.2);
    const headMaterial = new THREE.MeshLambertMaterial({ 
        color: 0xFFDBAE // Skin color
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.4;
    head.castShadow = true;
    playerGroup.add(head);
    
    // Arms
    const armGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.8);
    const armMaterial = new THREE.MeshLambertMaterial({ color: bodyMaterial.color });
    
    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-0.4, 0.6, 0);
    leftArm.castShadow = true;
    playerGroup.add(leftArm);
    
    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(0.4, 0.6, 0);
    rightArm.castShadow = true;
    playerGroup.add(rightArm);
    
    // Legs
    const legGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.8);
    const legMaterial = new THREE.MeshLambertMaterial({ color: 0x000080 }); // Dark blue
    
    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.set(-0.15, -0.4, 0);
    leftLeg.castShadow = true;
    playerGroup.add(leftLeg);
    
    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.set(0.15, -0.4, 0);
    rightLeg.castShadow = true;
    playerGroup.add(rightLeg);
    
    // Name tag (optional)
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;
    context.fillStyle = 'rgba(0,0,0,0.7)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'white';
    context.font = '20px Arial';
    context.textAlign = 'center';
    context.fillText('Player', canvas.width / 2, 35);
    
    const nameTexture = new THREE.CanvasTexture(canvas);
    const nameMaterial = new THREE.MeshBasicMaterial({ 
        map: nameTexture, 
        transparent: true 
    });
    const nameGeometry = new THREE.PlaneGeometry(1, 0.25);
    const nameTag = new THREE.Mesh(nameGeometry, nameMaterial);
    nameTag.position.y = 2;
    playerGroup.add(nameTag);
    
    playerGroup.position.set(player.x, player.y - 0.9, player.z); // Adjust for ground level
    
    scene.add(playerGroup);
    players.set(player.id, playerGroup);
}

function removePlayer(playerId) {
    const playerGroup = players.get(playerId);
    if (playerGroup) {
        scene.remove(playerGroup);
        players.delete(playerId);
    }
}

function updatePlayerPosition(data) {
    const playerGroup = players.get(data.id);
    if (playerGroup) {
        playerGroup.position.set(data.x, data.y - 0.9, data.z); // Adjust for ground level
        playerGroup.rotation.y = data.rotationY;
        
        // Make name tag always face the camera
        const nameTag = playerGroup.children[playerGroup.children.length - 1];
        if (nameTag && nameTag.material.map) {
            nameTag.lookAt(camera.position);
        }
    }
}

function createBullet(data) {
    const geometry = new THREE.SphereGeometry(0.05);
    const material = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const bulletMesh = new THREE.Mesh(geometry, material);
    
    bulletMesh.position.set(data.x, data.y, data.z);
    
    scene.add(bulletMesh);
    bullets.set(data.id, {
        mesh: bulletMesh,
        direction: new THREE.Vector3(data.dirX, data.dirY, data.dirZ),
        speed: 100
    });
}

function removeBullet(bulletId) {
    const bullet = bullets.get(bulletId);
    if (bullet) {
        scene.remove(bullet.mesh);
        bullets.delete(bulletId);
    }
}

function updateBullets(deltaTime) {
    bullets.forEach((bullet, id) => {
        const movement = bullet.direction.clone().multiplyScalar(bullet.speed * deltaTime);
        bullet.mesh.position.add(movement);
    });
}

function updateAmmoDisplay() {
    ammoCounter.textContent = `${playerAmmo}/${maxAmmo}`;
}

function updateHealthBar() {
    const healthPercent = (playerHealth / 100) * 100;
    healthFill.style.width = `${healthPercent}%`;
}

// Show damage indicator when hitting someone
function showDamageIndicator(damage, position) {
    const indicator = document.createElement('div');
    indicator.className = 'damage-indicator';
    indicator.textContent = `-${damage}`;
    
    // Convert 3D position to screen coordinates
    const vector = new THREE.Vector3(position.x, position.y, position.z);
    vector.project(camera);
    
    const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
    const y = (vector.y * -0.5 + 0.5) * window.innerHeight;
    
    indicator.style.left = x + 'px';
    indicator.style.top = y + 'px';
    
    document.body.appendChild(indicator);
    
    // Remove after animation
    setTimeout(() => {
        if (indicator.parentNode) {
            indicator.parentNode.removeChild(indicator);
        }
    }, 1500);
}

// Show hit flash when getting hit
function showHitFlash() {
    const flash = document.createElement('div');
    flash.className = 'hit-flash';
    document.body.appendChild(flash);
    
    // Remove after animation
    setTimeout(() => {
        if (flash.parentNode) {
            flash.parentNode.removeChild(flash);
        }
    }, 300);
}

// Animation loop
let clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    
    const deltaTime = clock.getDelta();
    
    updateMovement(deltaTime);
    updateBullets(deltaTime);
    
    renderer.render(scene, camera);
}

// Initialize game when page loads
document.addEventListener('DOMContentLoaded', init);
