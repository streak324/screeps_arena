import { prototypes, visual, constants} from "game";
import * as types from "./types";
import * as pathutils from "./pathutils";
import { CostMatrix } from "game/path-finder";

export function runLogic
(
	creep: prototypes.Creep, 
	state: types.State, 
	starterContainers: prototypes.StructureContainer[], 
	midfieldContainers: prototypes.StructureContainer[], 
	myDeposits: types.ResourceDeposit[], 
	costMatrix: CostMatrix
) {
	let availCap =  creep.store.getFreeCapacity(constants.RESOURCE_ENERGY)
	if (availCap === null) {
		console.log("creep", creep.id, "has null free capacity");
		return;
	}

	if (availCap === 0) {
		let deposit: types.ResourceDeposit|undefined;
		let bestScore: number;
		myDeposits.forEach(i => {
			let val = i.store.getFreeCapacity(constants.RESOURCE_ENERGY);
			let cap = creep.store.getUsedCapacity(constants.RESOURCE_ENERGY);
			if (val == undefined || cap == undefined || val < cap) {
				return;
			}
			let dist = i.getRangeTo(creep);
			if (deposit === undefined || bestScore > dist) {
				bestScore = dist;
				deposit = i;
			}
		});
		if (deposit === undefined) {
			console.log(creep.id, "hauler unable to find resource deposit");
			return;
		}
		let status = creep.transfer(deposit, constants.RESOURCE_ENERGY)
		if (status === undefined) {
			console.log(creep.id, "got undefined transfer status to deposit", deposit.id);
			return;
		}
		if (status === constants.ERR_NOT_IN_RANGE) {
			pathutils.moveCreepToTarget(creep, deposit, costMatrix, state);
		}
	}

	if (availCap > 0) {
		let container: prototypes.StructureContainer|undefined|null;
		container = state.haulerToContainer.get(creep.id);

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

			//if no starter containers, start going to the midfield containers
			if (container === undefined) {
				container = creep.findClosestByRange(midfieldContainers);
			} else {
				state.containerToHauler.set(container.id, <prototypes.Creep>creep);
				state.haulerToContainer.set(creep.id, container);
			}
		}

		if (container == undefined) {
			console.log(creep.id, "hauler unable to find a container");
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

		let status = creep.withdraw(container, constants.RESOURCE_ENERGY)
		if (status === undefined) {
			console.log(creep.id, "got undefined withdraw status from container",container.id);
			return;
		}
		if (status === constants.ERR_NOT_IN_RANGE) {
			pathutils.moveCreepToTarget(creep, container, costMatrix, state);
		}
	}
}