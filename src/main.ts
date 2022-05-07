//make sure todo list order is based on implementation priority
//TODO: improve predictions on a creep/cluster fight matchup
//TODO: allow multiple healers to heal the same creep
//TODO: add simple kiting mechanisms
//TODO: add rangers w/ simple kiting
//TODO: improve algorithm for identifying creep clusters, and measuring power.
//TODO: determine attack priority of individuals in enemy cluster.
//TODO: build and use ramparts

import { utils, prototypes, constants, visual, arenaInfo } from "game";
import { CostMatrix } from "game/path-finder";
import * as hauler from "./hauler";
import * as midfieldworker from "./midfieldworker";
import * as clustering from "./clustering";
import * as types from "./types";
import * as military from "./military";
import * as tactics from "./tactics";
import * as pathutils from "./pathutils";

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
	let allExtensions = utils.getObjectsByPrototype(prototypes.StructureExtension);

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
			desiredHaulers: 3,
			haulerBody: [constants.CARRY, constants.MOVE],
			assignedConstructions: new Map(),
			creepsTargets: new Map(),
			creepsPaths: new Map(),
			newCreepUnits: new Array(),
			myCreepUnits: new Array(),
			costMatrix: new CostMatrix(),
			fleeCostMatrix: new CostMatrix(),
		};
	} else if (utils.getTicks() > 150) {
		state.desiredMidfieldWorkers = 2;
	} else if (utils.getTicks() > 180) {
		state.desiredHaulers = 4;
		state.haulerBody = [constants.CARRY, constants.CARRY, constants.MOVE, constants.MOVE];
	}

	state.costMatrix = new CostMatrix();
	allCreeps.forEach(creep => { state.costMatrix.set(creep.x, creep.y, 255); })
	allSpawns.forEach(i => { state.costMatrix.set(i.x, i.y, 255); });
	walls.forEach(i => { state.costMatrix.set(i.x, i.y, 255); });
	allExtensions.forEach(i => { state.costMatrix.set(i.x, i.y, 255); });
	state.fleeCostMatrix = state.costMatrix.clone();

	enemyCreeps.forEach(i => { 
		let stats = tactics.getUnitStats(i); 
		let range = Math.min(0, Math.ceil(stats.range)-1);
		for (let dx = -range; dx <= range; dx++) {
			for (let dy = -range; dy <= range; dy++) {
				state.fleeCostMatrix.set(i.x + dx, i.y + dy, Math.ceil(128 * Math.abs(Math.max(dx, dy))/range));
			}
		}
	});

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
	let numAttackerCreeps = state.myCreepUnits.filter(i => i.role === types.ATTACKER).length;
	let numHealerCreeps = state.myCreepUnits.filter(i => i.role === types.HEALER).length;

	if (numHaulers < state.desiredHaulers) {
		let creep = mySpawn.spawnCreep(state.haulerBody).object;
		if (creep !== undefined) {
			state.newCreepUnits.push({role: types.HAULER, c: creep, lastPosition: {x: 0, y: 0}});
		}
	} else if (numWorkers < state.desiredMidfieldWorkers) {
		let creep = mySpawn.spawnCreep([constants.WORK, constants.WORK, constants.CARRY, constants.CARRY, constants.MOVE, constants.MOVE, constants.MOVE, constants.MOVE]).object;
		if (creep !== undefined) {
			state.newCreepUnits.push({role: types.WORKER, c: creep, lastPosition: {x: 0, y: 0}});
		}
	} else if (numAttackerCreeps <= numHealerCreeps) {
		let creep = mySpawn.spawnCreep([constants.MOVE, constants.ATTACK, constants.MOVE, constants.MOVE, constants.ATTACK, constants.ATTACK]).object;
		if (creep !== undefined) {
			state.newCreepUnits.push({role: types.ATTACKER, c: creep, lastPosition: {x: 0, y: 0}});
		}
	} else {
		let creep = mySpawn.spawnCreep([constants.MOVE, constants.MOVE, constants.MOVE, constants.HEAL]).object;
		if (creep !== undefined) {
			state.newCreepUnits.push({role: types.HEALER, c: creep, lastPosition: {x: 0, y: 0}});
		}
	}

	let midfieldContainers = utils.getObjectsByPrototype(prototypes.StructureContainer).filter(i => (i.x > 18 && i.x < 82 && i.y > 19 && i.y < 83 && i.store.getUsedCapacity(constants.RESOURCE_ENERGY)));
	let resources = utils.getObjectsByPrototype(prototypes.Resource);
	let myExtensions = utils.getObjectsByPrototype(prototypes.StructureExtension).filter(i => i.my);

	//clustering enemies
	let enemyClusters = new Array<types.UnitCluster>();
	let enemies = new Array<prototypes.Creep|prototypes.StructureTower|prototypes.StructureRampart|prototypes.StructureSpawn>(...enemySpawns, ...enemyCreeps, ...enemyRamparts, ...enemyTowers,);
	let creepViz = new visual.Visual(2, false);
	enemies.forEach(e => {
		clustering.putIntoCluster(e, state, creepViz, enemyClusters);
	});

	let myUnitClusters = new Array<types.UnitCluster>();
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
		clustering.putIntoCluster(i.c, state, creepViz, myUnitClusters);
	})

	if (state.debug) {
		clustering.debugDrawClusters(enemyClusters, creepViz, "#ff0000");
		clustering.debugDrawClusters(myUnitClusters, creepViz, "#0000ff");
	}

	let combatPairs = military.developCombatPairs(state, mySpawns);
	state.myCreepUnits.forEach((i, idx) => {
		if (i.role != types.HEALER && i.role != types.ATTACKER) {
			let fleeResults = tactics.flee(i.c, myUnitClusters, mySpawns, enemyClusters, enemyCreeps);
			if (fleeResults.ShouldFlee) {
				console.log("creep", i.c.id, "fleeing to position", fleeResults.FleeTo);
				pathutils.moveCreepToTarget(i.c, fleeResults.FleeTo, state.fleeCostMatrix, state);
				return;
			}
		}

		let deposits: Array<types.ResourceDeposit> = new Array(...mySpawns, ...myExtensions);
		switch (i.role) {
			case types.HAULER: {
				hauler.runLogic(i.c, state, starterContainers, midfieldContainers, deposits, state.costMatrix);
			} break;
			case types.WORKER: {
				midfieldworker.runLogic(i.c, idx, state, resources, myExtensions, midfieldContainers, enemyCreeps, state.costMatrix);
			} break;
			case types.ATTACKER: {
				military.runAttackerLogic(i.c, state, mySpawns, enemyCreeps, enemySpawns, enemyRamparts, myUnitClusters, enemyClusters);
			} break;
			case types.HEALER: {
				military.runHealerLogic(i.c, state, combatPairs, mySpawns, myUnitClusters, enemyClusters, enemyCreeps);
			} break;
		}

		i.lastPosition = {
			x: i.c.x,
			y: i.c.y,
		};
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