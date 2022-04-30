
import { prototypes, constants, utils} from "game";
import { CostMatrix, FindPathOpts } from "game/path-finder";

import * as types from "./types";
import * as pathutils from "./pathutils";
import { CREEP_SPAWN_TIME } from "game/constants";

export function runAttackerLogic(creep: prototypes.Creep, state: types.State, costMatrix: CostMatrix, mySpawns: prototypes.StructureSpawn[], enemyCreeps: Array<prototypes.Creep>, enemySpawns: prototypes.StructureSpawn[], enemyRamparts: prototypes.StructureRampart[]) {
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

	let s: constants.CreepActionReturnCode | constants.CreepMoveReturnCode | constants.ERR_NO_PATH | constants.ERR_INVALID_TARGET | undefined = creep.attack(target)
	if (s === constants.ERR_NOT_IN_RANGE) {
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

		let bestTile = pathutils.findNextTileInPath(creep, path);
		if (bestTile !== undefined) {
			let cost = costMatrix.get(bestTile.x, bestTile.y);
			//this can happen if the path was cached
			if (cost === 255) {
				path = creep.findPathTo(target, findPathOpts);
				state.creepsPaths.set(creep.id, path);
				bestTile = pathutils.findNextTileInPath(creep, path);
			}
		}

		if (bestTile !== undefined) {
			let dx = bestTile.x - creep.x;
			let dy = bestTile.y - creep.y;
			if (dx === 0 && dy === 0) {
				console.log(path);
			}
			let moveDir = utils.getDirection(dx, dy)
			s= creep.move(moveDir);
			costMatrix.set(creep.x, creep.y, 0);
			costMatrix.set(bestTile.x, bestTile.y, 255);
		} else {
			console.log("ERROR. UNABLE TO SET GET TILE. RE-EVALUATING");
			state.creepsPaths.delete(creep.id);
		}

	}
	if (s !== constants.OK && s !== undefined) {
		console.log("attack status on target", target.id, ":", s);
	}
}