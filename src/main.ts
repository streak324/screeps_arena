import { utils, prototypes, constants, visual } from "game";
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
	cpuViz: visual.Visual
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
};

export function loop(): void {
	let mySpawns = utils.getObjectsByPrototype(prototypes.StructureSpawn).filter(spawn => spawn.my);
	if (mySpawns.length == 0) {
		console.log("wtf. spawns are dead");
		return;
	}
	let mySpawn = mySpawns[0];

	let enemySpawns = utils.getObjectsByPrototype(prototypes.StructureSpawn).filter(spawn => !spawn.my);
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
			console.log("new attacker creep", creep)
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
			console.log(creep);
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
	
	let creep = mySpawn.spawnCreep([constants.ATTACK, constants.ATTACK, constants.MOVE, constants.MOVE, constants.MOVE]).object;
	if (creep !== undefined) {
		state.newAttackers.push(creep);
	}

	state.attackers.forEach(creep => {
		let s = creep.attack(enemySpawns[0])
		if (s === constants.ERR_NOT_IN_RANGE) {
			creep.moveTo(enemySpawns[0]);
		}
	});

	if (state.debug) {
		let style: TextStyle = {
			font: "12px",
			color: "#800080",
		}
		state.cpuViz.clear().text("CPU Wall Time us:" + utils.getCpuTime()/1000, mySpawn);
	}
}