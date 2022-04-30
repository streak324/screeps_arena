import { prototypes} from "game";

export function findNextTileInPath(creep: prototypes.Creep, path: prototypes.RoomPosition[]): prototypes.RoomPosition|undefined {
	let bestTile: prototypes.RoomPosition|undefined;
	let bestDistToCreep: number = 0; 
	path.forEach(tile => {
		if (creep.x === tile.x &&  creep.y === tile.y) {
			return;
		}

		let dist = creep.getRangeTo(tile);
		if (bestTile !== undefined && bestDistToCreep < dist) {
			return;
		}
		bestTile = tile;
		bestDistToCreep = dist;
	});

	return bestTile;
}