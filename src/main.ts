import { utils, prototypes } from "game";

export function loop(): void {
	let containers = utils.getObjectsByPrototype(prototypes.StructureContainer);
	containers.forEach(container => {
		console.log(container);
	});
}