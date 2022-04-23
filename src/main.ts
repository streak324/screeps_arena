//TODO: cluster enemy creeps together. ideas: put creeps in a bvh tree, using movement speed and attack/heal range to measure sphere of influence. 
//TODO: assess the strength of the enemy cluster.
//TODO: assess attack priority of creeps in enemy cluster.
//TODO: form creep squadrons.
//TODO: attack/defend against enemy clusters if stronger
//TODO: implement squadron retreats if being attacked by stronger enemy clusuter.
//TODO: implement healer logic into squadron
//TODO: implement rangers with basic kiting
//TODO: implement ramparts for use by squadrons
//TODO: haul midfield containers
//TODO: optimize pathfanding

import { utils, prototypes, constants, visual, arenaInfo } from "game";
import { getCpuTime } from "game/utils";

type State = {
	debug: boolean,
	desiredHaulers: number,
	containerToHauler: Map<prototypes.Id<prototypes.StructureContainer>, prototypes.Creep>,
	haulerToContainer: Map<prototypes.Id<prototypes.Creep>, prototypes.StructureContainer>,
	newHaulers: Array<prototypes.Creep>,
	haulers: Array<prototypes.Creep>,
	newAttackers: Array<prototypes.Creep>,
	attackers: Array<prototypes.Creep>,
	cpuViz: visual.Visual,
	maxWallTimeMS: number,
	maxWallTimeTick: number,
};

var state: State = {
	debug: true,
	desiredHaulers: 3,
	containerToHauler: new Map(),
	haulerToContainer: new Map(),
	newHaulers: new Array(),
	haulers: new Array(),
	cpuViz: new visual.Visual(2, true),
	newAttackers: new Array(),
	attackers: new Array(),
	maxWallTimeMS: 0.0,
	maxWallTimeTick: 1,
};

export function loop(): void {
	let mySpawns = utils.getObjectsByPrototype(prototypes.StructureSpawn).filter(spawn => spawn.my);
	if (mySpawns.length == 0) {
		console.log("wtf. spawns are dead");
		return;
	}
	let mySpawn = mySpawns[0];

	let enemySpawns = utils.getObjectsByPrototype(prototypes.StructureSpawn).filter(i => !i.my);
	let enemyRamparts = utils.getObjectsByPrototype(prototypes.StructureRampart).filter(i => !i.my);
	let enemyTowers = utils.getObjectsByPrototype(prototypes.StructureTower).filter(i => !i.my);
	let walls = utils.getObjectsByPrototype(prototypes.StructureWall)
	let enemyCreeps = utils.getObjectsByPrototype(prototypes.Creep).filter(creep => !creep.my);

	while (state.newHaulers.length > 0) {
		let creep = state.newHaulers.pop();
		if (creep !== undefined && creep.exists) {
			state.haulers.push(creep);
		}
	}

	while (state.newAttackers.length > 0) {
		let creep = state.newAttackers.pop();
		if (creep !== undefined && creep.exists) {
			state.attackers.push(creep);
		}
	}

	if (state.haulers.length < state.desiredHaulers) {
		let creep = mySpawn.spawnCreep([constants.MOVE, constants.CARRY]).object;
		if (creep !== undefined) {
			state.newHaulers.push(creep);
		}
	}

	let starterContainers = utils.getObjectsByPrototype(prototypes.StructureContainer).filter(container => mySpawn.getRangeTo(container) < 5);
	state.haulers.forEach((creep, idx) => {
		if (creep.exists === false) {
			state.haulers[idx] = state.haulers[state.haulers.length-1];
			state.haulers.pop();
			let container = state.haulerToContainer.get(creep.id);
			if (container !== undefined) {
				state.containerToHauler.delete(container.id);
			}
			state.haulerToContainer.delete(creep.id);
			return;
		}
		let container = state.haulerToContainer.get(creep.id);

		if (container === undefined || !container.exists || container.store.getUsedCapacity(constants.RESOURCE_ENERGY) == 0) {
			state.haulerToContainer.delete(creep.id);
			if (container !== undefined) {
				state.containerToHauler.delete(container.id);
			}

			container = starterContainers.find(container => {
				let assignedCreep = state.containerToHauler.get(container.id);
				if (assignedCreep === undefined || !assignedCreep.exists) {
					return container;
				}
			});
			if (container === undefined) {
				return;
			}
			state.containerToHauler.set(container.id, <prototypes.Creep>creep);
			state.haulerToContainer.set(creep.id, container);
		}

		if (container === undefined) {
			if (state.debug) {
				let style: TextStyle = {
					font: 0.7,
					color: "#ff0000",
				}
				new visual.Visual(1, false).text("Ih" + creep.id, creep, style);
			}
			return;
		}

		if (state.debug) {
			let style: TextStyle = {
				font: 0.7,
				color: "#800080",
			}
			new visual.Visual(1, false).text("h" + creep.id, container, style);
			new visual.Visual(1, false).text("h" + creep.id, creep, style);
		}

		if(creep.id == undefined) {
			return;
		}

		let availCap =  creep.store.getFreeCapacity(constants.RESOURCE_ENERGY)
		if (availCap === null) {
			console.log("creep", creep.id, "has null free capacity");
			return;
		}

		if (availCap > 0) {
			let status = creep.withdraw(container, constants.RESOURCE_ENERGY)
			if (status === undefined) {
				console.log(creep.id, "got undefined withdraw status from container",container.id);
				return;
			}
			if (status === constants.ERR_NOT_IN_RANGE) {
				creep.moveTo(container);
			}
		} else {
			let status = creep.transfer(mySpawn, constants.RESOURCE_ENERGY)
			if (status === undefined) {
				console.log(creep.id, "got undefined transfer status to spawn",container.id);
				return;
			}
			if (status === constants.ERR_NOT_IN_RANGE) {
				creep.moveTo(mySpawn);
			}
		}
	});
	
	let creep = mySpawn.spawnCreep([constants.MOVE, constants.ATTACK, constants.ATTACK, constants.MOVE, constants.MOVE]).object;
	if (creep !== undefined) {
		state.newAttackers.push(creep);
	}

	state.attackers.forEach(creep => {
		let target: prototypes.Creep | prototypes.Structure | undefined;
		let e = creep.findClosestByRange(enemyCreeps);
		if (e != undefined && utils.getRange(creep, e) < 5 && e.hits > 0 && utils.getRange(e, enemySpawns[0]) > 0.5) {
			target = e;
		} else {
			let er = creep.findClosestByRange(enemyRamparts);
			if (er != undefined) {
				target = er;
			} else {
				target = enemySpawns[0];
			}
		}

		if (target === undefined) {
			return;
		}

		let s = moveToAndAttack(creep, target);
		if (s !== constants.OK) {
			console.log("unable to to attack target", target.id);
		}
	});

	if (state.debug) {
		let style: TextStyle = {
			font: 8.0,
			color: "#800080",
		}

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

arenaInfo.cpuTimeLimitFirstTick

		state.cpuViz.clear();
		state.cpuViz.text("Tick Wall Time ms:" + wallTimeMS, pos1);
		state.cpuViz.text("Max Tick Wall Time (ms:" + state.maxWallTimeMS + ", tick: " + state.maxWallTimeTick + ")", pos2 );
		state.cpuViz.text("First Tick Alloc Time ms:" + arenaInfo.cpuTimeLimitFirstTick/1_000_000, pos3);
		state.cpuViz.text("Tick Alloc Time ms:" + arenaInfo.cpuTimeLimitFirstTick/1_000_000, pos4);
	}
}

function moveToAndAttack(creep: prototypes.Creep, target: prototypes.Creep | prototypes.Structure): constants.CreepActionReturnCode | constants.CreepMoveReturnCode | constants.ERR_NO_PATH | constants.ERR_INVALID_TARGET | undefined {
	let s = creep.attack(target)
	if (s === constants.ERR_NOT_IN_RANGE) {
		return creep.moveTo(target);
	}
	return s;

}