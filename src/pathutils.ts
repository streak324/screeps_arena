import { prototypes, utils } from "game";
import { CostMatrix, FindPathOpts } from "game/path-finder";
import * as types from "./types";

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

export function moveCreepToTarget(creep: prototypes.Creep, target: types.Target, costMatrix: CostMatrix, state: types.State) {
	let findPathOpts: FindPathOpts = {
		costMatrix: costMatrix,
	}
	let prevTarget = state.creepsTargets.get(creep.id);
	let path = state.creepsPaths.get(creep.id);
	if (prevTarget === undefined || path === undefined || prevTarget.id !== target.id || prevTarget.x != target.x || prevTarget.y != target.y) {
		if (prevTarget !== undefined) {
			console.log("reevaluating path");
		}
		path = creep.findPathTo(target, findPathOpts);
		state.creepsTargets.set(creep.id, {
			id: target.id,
			x: target.x,
			y: target.y,
		});
		state.creepsPaths.set(creep.id, path);
	}

	let bestTile = findNextTileInPath(creep, path);
	if (bestTile !== undefined) {
		let cost = costMatrix.get(bestTile.x, bestTile.y);
		//this can happen if the path was cached
		if (cost === 255) {
			path = creep.findPathTo(target, findPathOpts);
			state.creepsPaths.set(creep.id, path);
			bestTile = findNextTileInPath(creep, path);
		}
	}

	if (bestTile !== undefined) {
		let dx = bestTile.x - creep.x;
		let dy = bestTile.y - creep.y;
		if (dx === 0 && dy === 0) {
			console.log(path);
		}
		let moveDir = utils.getDirection(dx, dy)
		creep.move(moveDir);
		costMatrix.set(creep.x, creep.y, 0);
		costMatrix.set(bestTile.x, bestTile.y, 255);
	} else {
		console.log("ERROR. UNABLE TO SET GET TILE. RE-EVALUATING");
		state.creepsPaths.delete(creep.id);
	}
}