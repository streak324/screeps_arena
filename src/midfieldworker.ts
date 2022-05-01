import { prototypes, visual, constants, utils} from "game";
import { CostMatrix } from "game/path-finder";
import * as types from "types";
import * as pathutils from "./pathutils";

export function runLogic(creep: prototypes.Creep, idx: number, state: types.State, resources: prototypes.Resource[], myExtensions: prototypes.StructureExtension[], midfieldContainers: prototypes.StructureContainer[], enemyCreeps: prototypes.Creep[], costMatrix: CostMatrix) {
	let container = state.haulerToContainer.get(creep.id);

	let resource = creep.findClosestByRange(resources);
	let containerSpent = container === undefined || !container.exists || container.store.getUsedCapacity(constants.RESOURCE_ENERGY) == 0
	let energyOnTheGround = resource != undefined && resource.x == creep.x && resource.y == creep.y && resource.resourceType == constants.RESOURCE_ENERGY && resource.amount > 0;
	let availCap = creep.store.getFreeCapacity(constants.RESOURCE_ENERGY);
	let usedCap = creep.store.getUsedCapacity(constants.RESOURCE_ENERGY);
	let nearbyExtensions = creep.findInRange(myExtensions, 1).filter(i => i.store.getFreeCapacity(constants.RESOURCE_ENERGY));

	let availableEnergy: number = 0;
	if (resource != undefined && energyOnTheGround) {
		availableEnergy = resource.amount;
	}
	if (usedCap != undefined) {
		availableEnergy += usedCap;
	}

	let containerSpentButStillHaveEnergy = containerSpent && availableEnergy >= 10;

	if (availCap === 0 && nearbyExtensions.length > 0) {
		nearbyExtensions.forEach(i => {
			creep.transfer(i, constants.RESOURCE_ENERGY);
		});
	}
	//check if able to build extensions
	else if (containerSpentButStillHaveEnergy) {
		if (usedCap != undefined && usedCap >= 10) {
			console.log("building extensions")
			let construction = state.assignedConstructions.get(creep.id);
			if (construction === undefined || !construction.exists) {
				construction = undefined
			}
			for(let x = -1; construction === undefined && x <= 1; x++) {
				for(let y = -1; y <= 1; y++) {
					if (x == 0 && y == 0) {
						continue;
					}
					let res = utils.createConstructionSite({x: creep.x +x, y: creep.y + y}, prototypes.StructureExtension);
					console.log(res);
					if (res.object !== undefined) {
						construction = res.object;
						state.assignedConstructions.set(creep.id, res.object);
						break;
					}
				}
			}
			if(construction !== undefined) {
				let status = creep.build(construction);
				if (status === constants.ERR_NOT_IN_RANGE) {
					state.assignedConstructions.delete(creep.id);
				}
			} else {
				nearbyExtensions.forEach(i => {
					creep.transfer(i, constants.RESOURCE_ENERGY);
				});
				creep.drop(constants.RESOURCE_ENERGY);
			}
		} else if (energyOnTheGround && resource != undefined) {
			console.log("picking up energy");
			creep.pickup(resource);
		}
	}  
	//start dropping
	else if (availCap === 0) {
		console.log("dropping energy");
		creep.drop(constants.RESOURCE_ENERGY);
	}
	//look for a new container
	else if (containerSpent) {
		console.log("looking for container", midfieldContainers.length, " midfield containers for the pickings");
		if (container !== undefined) {
			state.haulerToContainer.delete(creep.id);
			state.containerToHauler.delete(container.id);
		}

		let bestContainer: prototypes.StructureContainer|undefined;
		let bestDist: number;
		midfieldContainers.forEach(container => {
			let assignedCreep = state.containerToHauler.get(container.id);
			if (assignedCreep !== undefined && assignedCreep.exists) {
				return;
			}
			let dist = creep.getRangeTo(container)
			if (bestContainer !== undefined && dist < bestDist) {
				return;
			}

			if (container.findInRange(enemyCreeps, 5).length > 0) {
				return;
			}

			let ticksToDecay: number = 1000;
			if (creep.ticksToDecay != undefined) {
				ticksToDecay = creep.ticksToDecay;
			}

			bestDist = dist / ticksToDecay;
			bestContainer = container;
		});
		if (bestContainer === undefined) {
			return;
		}
		state.containerToHauler.set(bestContainer.id, <prototypes.Creep>creep);
		state.haulerToContainer.set(creep.id, bestContainer);
	}

	if (container === undefined || !container.exists) {
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

	if (availCap != undefined && availCap > 0) {
		let status = creep.withdraw(container, constants.RESOURCE_ENERGY);
		if (status === undefined) {
			console.log(creep.id, "got undefined withdraw status from container",container.id);
			return;
		}
		if (status === constants.ERR_NOT_IN_RANGE) {
			creep.moveTo(container);
		}
	}
}