//make sure todo list order is based on implementation priority
//TODO: pair up attackers with healers
//TODO: add enemy avoidance mechanisms 
//TODO: setup ranger patrols in midfield for skirmishing
//TODO: improve midfield energy utilization
//TODO: breakup code into separate files
//TODO: add haulers to aid midfield worker
//TODO: identify camps for creep squads to form.
//TODO: select creeps to be in squads
//TODO: implement healer logic into squads
//TODO: add rangers with basic kiting
//TODO: move squads in unison to spawn
//TODO: add retreat mechanisms
//TODO: allow squads to breakup to do skirmishing
//TODO: adjust behavior of squads against enemy clusters based on cluster's strength
//TODO: compare logistical/terrain advantage b/w squads and enemy clusters
//TODO: determine attack priority of individuals in enemy cluster.
//TODO: improve algorithm for identifying clusters of enemies. ideas: DBSCAN (Density-Based Spatial Clustering of Applications with Noise)
//TODO: implement ramparts for use by squads

import { utils, prototypes, constants, visual, arenaInfo } from "game";
import { CostMatrix } from "game/path-finder";
import * as hauler from "./hauler";
import * as midfieldworker from "./midfieldworker";
import * as enemy from "./enemy";
import * as types from "./types";
import * as military from "./military";

const DIRECTION_ARRAY: constants.DirectionConstant[] = [
	constants.TOP_LEFT, constants.TOP, constants.TOP_RIGHT,
	constants.LEFT, constants.TOP, constants.RIGHT,
	constants.BOTTOM_LEFT, constants.BOTTOM, constants.BOTTOM_RIGHT,
];

let state: types.State;

const SPAWN_SWAMP_BASIC_ARENA_WIDTH = 100;
const SPAWN_SWAMP_BASIC_ARENA_HEIGHT = 100;

//Math.ceil((totalParts - numMove) * 5 / numMove) would be swamp ticks per tile 
// numMove => relieved fatigue. (totalParts - numMove) * 5 => generated fatigue

//attacker cost -> 2*tough + 2*attack + 4*move = 380 energy
//healer cost -> 2*tough + 2*heal  + 4*move = 720 energy
//ranger cost -> 3*range + 3*move = 600 energy
//squad cost -> 3*attackers + 3*healers + 2*rangers -> 4340

//midfield worker -> 2*work + 2*carry + 4*move = 500

export function loop(): void {

	let allSpawns = utils.getObjectsByPrototype(prototypes.StructureSpawn);
	let mySpawns = utils.getObjectsByPrototype(prototypes.StructureSpawn).filter(spawn => spawn.my);
	if (mySpawns.length == 0) {
		console.log("wtf. spawns are dead");
		return;
	}
	let mySpawn = mySpawns[0];

	let allCreeps = utils.getObjectsByPrototype(prototypes.Creep);
	let enemySpawns = utils.getObjectsByPrototype(prototypes.StructureSpawn).filter(i => !i.my);
	let enemyRamparts = utils.getObjectsByPrototype(prototypes.StructureRampart).filter(i => !i.my);
	let enemyTowers = utils.getObjectsByPrototype(prototypes.StructureTower).filter(i => !i.my);
	let walls = utils.getObjectsByPrototype(prototypes.StructureWall);
	let enemyCreeps = allCreeps.filter(creep => !creep.my);

	//WE ARE AT THE START OF THE GAME. DO ALL STATIC COMPUTATION HERE
	if (utils.getTicks() === 1) {
		state = {
			debug: true,
			containerToHauler: new Map(),
			haulerToContainer: new Map(),
			cpuViz: new visual.Visual(2, true),
			maxWallTimeMS: 0.0,
			maxWallTimeTick: 1,
			desiredMidfieldWorkers: 1,
			assignedConstructions: new Map(),
			creepsTargets: new Map(),
			creepsPaths: new Map(),
			combatPairCounter: 0,
			combatPairs: new Array(),
			creepIdToCombatPair: new Map(),
			newCreepUnits: new Array(),
			myCreepUnits: new Array(),
		};
	}


	let costMatrix = new CostMatrix();
	allCreeps.forEach(creep => { costMatrix.set(creep.x, creep.y, 255); })
	allSpawns.forEach(i => { costMatrix.set(i.x, i.y, 255); });

	let creepCampOffset = 4;
	if (mySpawn.x > SPAWN_SWAMP_BASIC_ARENA_WIDTH/2) {
		creepCampOffset = -4;
	}

	while (state.newCreepUnits.length > 0) {
		let unit = state.newCreepUnits.pop();
		if (unit !== undefined && unit.c.exists) {
			state.myCreepUnits.push(unit);
		}
	}

	let starterContainers = utils.getObjectsByPrototype(prototypes.StructureContainer).filter(container => {
		let isCloseToSpawn = mySpawn.getRangeTo(container) < 5;
		let cap = container.store.getUsedCapacity(constants.RESOURCE_ENERGY);
		return isCloseToSpawn && cap != undefined && cap > 200;
	});

	let numHaulers = state.myCreepUnits.filter(i => i.role === types.HAULER).length;
	let numWorkers = state.myCreepUnits.filter(i => i.role === types.WORKER).length;

	if (numHaulers < starterContainers.length) {
		let creep = mySpawn.spawnCreep([constants.CARRY, constants.MOVE]).object;
		if (creep !== undefined) {
			state.newCreepUnits.push({role: types.HAULER, c: creep});
		}
	} else if (numWorkers < state.desiredMidfieldWorkers) {
		let creep = mySpawn.spawnCreep([constants.WORK, constants.WORK, constants.CARRY, constants.CARRY, constants.MOVE, constants.MOVE, constants.MOVE, constants.MOVE]).object;
		if (creep !== undefined) {
			state.newCreepUnits.push({role: types.WORKER, c: creep});
		}
	} else {
		let creep = mySpawn.spawnCreep([constants.MOVE, constants.ATTACK, constants.MOVE, constants.MOVE, constants.ATTACK, constants.ATTACK]).object;
		if (creep !== undefined) {
			state.newCreepUnits.push({role: types.ATTACKER, c: creep});
		}
	}

	let midfieldContainers = utils.getObjectsByPrototype(prototypes.StructureContainer).filter(i => (i.x > 18 && i.x < 82 && i.y > 20 && i.y < 80));
	let resources = utils.getObjectsByPrototype(prototypes.Resource);
	let myExtensions = utils.getObjectsByPrototype(prototypes.StructureExtension).filter(i => i.my);

	//clustering enemies
	let enemyClusters = new Array<types.UnitCluster>();
	let enemies = new Array<prototypes.Creep|prototypes.StructureTower|prototypes.StructureRampart|prototypes.StructureSpawn>(...enemySpawns, ...enemyCreeps, ...enemyRamparts, ...enemyTowers,);
	let enemyLabelViz = new visual.Visual(2, false);
	enemies.forEach(e => {
		enemy.predictEnemy(e, state, enemyLabelViz, enemyClusters);
	});

	if (state.debug) {
		enemyClusters.forEach(cluster => {
			let topleft: prototypes.RoomPosition = {
				x: cluster.min.x-0.5,
				y: cluster.min.y-0.5,
			}
			let topleftpad: prototypes.RoomPosition = {
				x: cluster.min.x-1.5,
				y: cluster.min.y-1.5,
			}
			let style: PolyStyle = {
				fill: "#ff0000",
				lineStyle: "solid",
			}
			let padStyle: PolyStyle = {
				fill: "#ffffff",
				lineStyle: "solid",
				opacity: 0.2,
			}
			enemyLabelViz.rect(topleftpad, cluster.max.x - cluster.min.x+3, cluster.max.y - cluster.min.y+3, padStyle);
			enemyLabelViz.rect(topleft, cluster.max.x - cluster.min.x+1, cluster.max.y - cluster.min.y+1, style);

			let textStyle: TextStyle = {
				font: 0.7,
				color: "#ffffff",
				backgroundColor: "#80808080",
			}
			let text = "EC" + cluster.id + ": ";
			cluster.units.forEach(e => {
				text += e.id + ", ";
			});
			text +="\nPower: " + cluster.power;
			text += "\nArea: " + (cluster.max.x - cluster.min.x + 1) * (cluster.max.y - cluster.min.y + 1); 
			text += "\nMass: " + cluster.mass; 
			let centerTop: prototypes.RoomPosition = {
				x: cluster.min.x + (cluster.max.x - cluster.min.x) / 2,
				y: cluster.min.y-1,
			} 
			enemyLabelViz.text(text, centerTop, textStyle);
		});
	}

	state.myCreepUnits.forEach((i, idx) => {
		if(mySpawns.find(j => j.x === i.c.x && j.y === i.c.y)) {
			return;
		}

		if (!i.c.exists) {
			state.myCreepUnits[idx] = state.myCreepUnits[state.myCreepUnits.length-1];
			state.myCreepUnits.pop();
			console.log("creep", i.c.id, "dead. bye bye");
			let container = state.haulerToContainer.get(i.c.id);
			if (container !== undefined) {
				state.containerToHauler.delete(container.id);
			}
			state.haulerToContainer.delete(i.c.id);
			state.assignedConstructions.delete(i.c.id);
			return;
		}

		switch (i.role) {
			case types.HAULER: {
				hauler.runLogic(i.c, idx, state, starterContainers, mySpawn);
			} break;
			case types.WORKER: {
				midfieldworker.runLogic(i.c, idx, state, resources, myExtensions, midfieldContainers, enemyCreeps);
			} break;
			case types.ATTACKER: {
				military.runAttackerLogic(i.c, state, costMatrix, mySpawns, enemyCreeps, enemySpawns, enemyRamparts);
			} break;
		}
	});

	if (state.debug) {
		let wallTimeMS = utils.getCpuTime()/1_000_000;
		if (state.maxWallTimeMS < wallTimeMS) {
			state.maxWallTimeMS = wallTimeMS;
			state.maxWallTimeTick = utils.getTicks();
		}

		let pos1: prototypes.RoomPosition = {
			x: mySpawn.x,
			y: mySpawn.y,
		};
		let pos2: prototypes.RoomPosition = {
			x: mySpawn.x,
			y: mySpawn.y + 4.0,
		};
		let pos3: prototypes.RoomPosition = {
			x: mySpawn.x,
			y: mySpawn.y + 8.0,
		};
		let pos4: prototypes.RoomPosition = {
			x: mySpawn.x,
			y: mySpawn.y + 12.0,
		};

		state.cpuViz.clear();
		state.cpuViz.text("Tick Wall Time ms:" + wallTimeMS, pos1);
		state.cpuViz.text("Max Tick Wall Time (ms:" + state.maxWallTimeMS + ", tick: " + state.maxWallTimeTick + ")", pos2 );
		state.cpuViz.text("First Tick Alloc Time ms:" + arenaInfo.cpuTimeLimitFirstTick/1_000_000, pos3);
		state.cpuViz.text("Tick Alloc Time ms:" + arenaInfo.cpuTimeLimit/1_000_000, pos4);
	}
}