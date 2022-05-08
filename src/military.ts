
import { prototypes, constants, utils} from "game";
import { CostMatrix } from "game/path-finder";

import * as types from "./types";
import * as pathutils from "./pathutils";
import * as tactics from "./tactics";

export function runAttackerLogic(
	creep: prototypes.Creep, 
	state: types.State, 
	mySpawns: prototypes.StructureSpawn[], 
	enemyCreeps: Array<prototypes.Creep>, 
	enemySpawns: prototypes.StructureSpawn[], 
	enemyRamparts: prototypes.StructureRampart[],
	myClusters: types.UnitCluster[], 
	enemyClusters: types.UnitCluster[], 
) {
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



	let costMatrix = state.costMatrix;
	let moveToTarget: types.Target = target;
	let fleeResults = tactics.flee(creep, myClusters, mySpawns, enemyClusters, enemyCreeps);
	if (fleeResults.ShouldFlee) {
		console.log("creep", creep.id, "fleeing to position", fleeResults.FleeTo);
		moveToTarget = fleeResults.FleeTo;
		costMatrix = state.fleeCostMatrix;
	}

	pathutils.moveCreepToTarget(creep, moveToTarget, costMatrix, state);
	creep.attack(target);
}

export function runHealerLogic(
	creep: prototypes.Creep, 
	state: types.State, 
	combatPairs: Map<prototypes.Id<prototypes.Creep>, types.CombatPair>, 
	mySpawns: prototypes.StructureSpawn[], 
	myClusters: types.UnitCluster[], 
	enemyClusters: types.UnitCluster[], 
	enemyCreeps: prototypes.Creep[]
) {
	let pair = combatPairs.get(creep.id);
	if (pair === undefined) {
		pathutils.moveCreepToTarget(creep, mySpawns[0], state.costMatrix, state);
		return;
	}
	let moveToTarget: types.Target = pair.attacker;

	let costMatrix = state.costMatrix;
	let fleeResults = tactics.flee(creep, myClusters, mySpawns, enemyClusters, enemyCreeps);
	if (fleeResults.ShouldFlee) {
		console.log("creep", creep.id, "fleeing to position", fleeResults.FleeTo);
		moveToTarget = fleeResults.FleeTo;
		costMatrix = state.fleeCostMatrix;
	}

	let patientHPPercent = pair.attacker.hits / pair.attacker.hitsMax;
	if (patientHPPercent < 1) {
		pathutils.moveCreepToTarget(creep, moveToTarget, costMatrix, state);
		let status = creep.heal(pair.attacker);
		if (status == constants.ERR_NOT_IN_RANGE) {
			creep.rangedHeal(pair.attacker);
		}
	} else {
		pathutils.moveCreepToTarget(creep, pair.attacker, costMatrix, state);
		creep.heal(creep);
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
			let w = 1.0;
			let pair = pairs.get(j.c.id);
			if (pair === undefined) {
				w = 2.0;
			}
			let dist = utils.getRange(i.c, j.c);
			let hpPercent = j.c.hits / j.c.hitsMax; 
			let score = w / (1.0 + dist * dist * hpPercent);
			if (bestScore < score) {
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
