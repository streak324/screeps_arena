
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
		pathutils.moveCreepToTarget(creep, target, costMatrix, state);
	} else if (s !== constants.OK && s !== undefined) {
		console.log("attack status on target", target.id, ":", s);
	}
}

export function runHealerLogic(creep: prototypes.Creep, state: types.State, costMatrix: CostMatrix, combatPairs: Map<prototypes.Id<prototypes.Creep>, types.CombatPair>, mySpawns: prototypes.StructureSpawn[]) {
	let pair = combatPairs.get(creep.id);
	if (pair === undefined) {
		pathutils.moveCreepToTarget(creep, mySpawns[0], costMatrix, state);
		return;
	}

	let patientHPPercent = pair.attacker.hits / pair.attacker.hitsMax;
	if (patientHPPercent < 1) {
		let s = creep.heal(pair.attacker);
		if (s === constants.ERR_NOT_IN_RANGE) {
			pathutils.moveCreepToTarget(creep, pair.attacker, costMatrix, state);
		} else if (s !== constants.OK && s !== undefined) {
			console.log("medic status on healing pair", creep.id, pair.attacker.id, ":", s);
		}
	} else {
		pathutils.moveCreepToTarget(creep, pair.attacker, costMatrix, state);
	}
}

export function developCombatPairs(state: types.State, mySpawns: prototypes.StructureSpawn[]): Map<prototypes.Id<prototypes.Creep>, types.CombatPair> {
	let pairs: Map<prototypes.Id<prototypes.Creep>, types.CombatPair> = new Map();

	let healers = state.myCreepUnits.filter(i => i.role === types.HEALER);
	let attackers = state.myCreepUnits.filter(i => i.role === types.ATTACKER);

	healers.forEach(i => {
		let bestPatient: prototypes.Creep|undefined;
		let bestScore: number = 0;
		attackers.forEach(j => {
			if (mySpawns.find(k => k.x === j.c.x && k.x === j.c.x)) {
				return;
			}
			let dist = utils.getRange(i.c, j.c);
			let hpPercent = j.c.hits / j.c.hitsMax; 
			let score = 1.0 / (1.0 + dist * hpPercent);
			let pair = pairs.get(j.c.id);
			if (pair === undefined && bestScore < score) {
				bestScore = score;
				bestPatient = j.c;
			}
		});
		if (bestPatient !== undefined) {
			let pair: types.CombatPair  = {
				attacker: bestPatient,
				healer: i.c,
			};
			pairs.set(bestPatient.id, pair);
			pairs.set(i.c.id, pair);
		}
	});

	return pairs;
}
