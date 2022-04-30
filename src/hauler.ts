import { prototypes, visual, constants} from "game";
import { State} from "types";

export function runLogic(creep: prototypes.Creep, idx: number, state: State, starterContainers: prototypes.StructureContainer[], mySpawn: prototypes.StructureSpawn) {
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
			state.assignedConstructions.delete(creep.id);
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
}