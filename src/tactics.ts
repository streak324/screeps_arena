import { prototypes, constants, utils} from "game";
import { RoomPosition } from "game/prototypes";

import * as types from "./types";

export type FleeResults = {
	FleeTo: types.Target,
	ShouldFlee: boolean,
}

const MIN_FLEE_DIST = 8;

export function flee(creep: prototypes.Creep, myClusters: types.UnitCluster[], mySpawns: prototypes.StructureSpawn[], enemyClusters: types.UnitCluster[], enemies: prototypes.Creep[]): FleeResults {
	var closestEnemy: prototypes.Creep|undefined;
	let enemyDist: number = 0;
	enemies.forEach(e => {
		let stats = getUnitStats(e);
		let dist = e.getRangeTo(creep);
		if (closestEnemy === undefined || (stats.attackPower > 0 && enemyDist > dist)) {
			enemyDist = dist;
			closestEnemy = e;
		}
	})

	if (enemyDist > MIN_FLEE_DIST || closestEnemy === undefined) {
		return {
			FleeTo: creep,
			ShouldFlee: false,
		};
	}

	let ec = enemyClusters.find(i => i.units.find(j => { return closestEnemy !== undefined && j.id == closestEnemy.id;}));

	let creepCluster = myClusters.find(i => i.units.find(j => j.id == creep.id));

	let enemyStats: types.UnitStats;
	let enemyPos: RoomPosition;

	if (ec !== undefined) {
		enemyStats = ec.stats;
		enemyPos = ec.centerPower;
	} else {
		console.log("no cluster found for enemy", closestEnemy.id);
		enemyStats = getUnitStats(closestEnemy);	
		enemyPos = closestEnemy;
	}

	let myStats: types.UnitStats;
	let myPos: RoomPosition;

	if (creepCluster !== undefined) {
		myStats = creepCluster.stats;
		myPos = creepCluster.centerPower;
	} else {
		console.log("no cluster found for creep", creep.id);
		myStats = getUnitStats(creep);
		myPos = creep;
	}

	//very rough approximation on number of ticks it takes to for one to beat the other.
	let enemyFreeAttackTicks = Math.min(0, (enemyStats.range - 1) / myStats.moveSpeed);
	let enemyNetAttack = enemyStats.attackPower - myStats.healPower;
	console.log(enemyNetAttack);
	let myScore: number = (myStats.attackPower - enemyStats.healPower) / enemyStats.hits;
	let enemyScore: number =  enemyNetAttack / Math.max(1, (myStats.hits - enemyNetAttack * enemyFreeAttackTicks));

	console.log(creep.id, "matchup vs enemy:", myScore, enemyScore);

	if (myScore > enemyScore) {
		return {
			FleeTo: creep,
			ShouldFlee: false,
		};
	}

	var fleeToCluster: types.UnitCluster|undefined;
	let clusterDist: number = 0;
	myStats = getUnitStats(creep);
	myClusters.forEach(cluster => {
		if (creepCluster !== undefined && cluster.id == creepCluster.id) {
			return;
		}

		let enemyNetAttack = enemyStats.attackPower - (cluster.stats.healPower + myStats.healPower);
		let myScore: number = ((cluster.stats.attackPower + myStats.attackPower) - enemyStats.healPower) / enemyStats.hits;
		let enemyScore: number = enemyNetAttack / Math.max(1, (cluster.stats.hits + myStats.hits - enemyNetAttack * enemyFreeAttackTicks));
		if (myScore >= enemyScore) {
			let dist = creep.getRangeTo(cluster.centerPower);
			if (fleeToCluster === undefined || dist < clusterDist) {
				clusterDist = dist
				fleeToCluster = cluster;
			}
		}
	});


	if (fleeToCluster === undefined) {
		let mySpawn = mySpawns.find(i => i);
		if (mySpawn) {
			return {
				FleeTo: mySpawn,
				ShouldFlee: true,
			};
		}
		console.log("no cluster AND no spawn to flee to for creep", creep.id);
		return {
			FleeTo: creep,
			ShouldFlee: true,
		};
	}

	return {
		FleeTo: { id: "my_cluster" + fleeToCluster.id, x: fleeToCluster.centerPower.x, y: fleeToCluster.centerPower.y },
		ShouldFlee: true,
	};
}

export function getUnitStats(e: prototypes.StructureSpawn|prototypes.Creep|prototypes.StructureTower|prototypes.StructureRampart): types.UnitStats {
	let stats: types.UnitStats = {
		attackPower: 0,
		healPower: 0,
		range: 1,
		moveSpeed: 0,
		hits: e.hits,
	}

	if (e instanceof prototypes.Creep) {
		let rangePartCnt = 0;
		let attackPartCnt = 0;
		let healPartCnt = 0;
		let movePartCnt = 0;
		e.body.forEach(p => {
			switch (p.type) {
				case constants.ATTACK:
					attackPartCnt++;
				break;
				case constants.RANGED_ATTACK:
					rangePartCnt++;
				break;
				case constants.HEAL:
					healPartCnt++;
				break;
				case constants.MOVE:
					movePartCnt +=1;
				break;
			};
		});

		// numMove => relieved fatigue. (totalParts - numMove) * 5 => generated fatigue
		let generatedFatigue = (e.body.length - movePartCnt) * 5;
		stats.range = 2.0 + 2.0 * Math.max(Math.min(1.0, rangePartCnt) + Math.min(1.0, healPartCnt)) + Math.min(1.0, movePartCnt / Math.max(1.0, generatedFatigue)),
		stats.attackPower = constants.ATTACK_POWER * attackPartCnt + constants.RANGED_ATTACK_POWER * rangePartCnt,
		stats.healPower = constants.HEAL_POWER * healPartCnt,
		stats.moveSpeed = Math.min(1.0, movePartCnt / Math.max(generatedFatigue));
	} else if (e instanceof prototypes.StructureRampart) {
		stats.attackPower = 20;
		stats.range = 1;
	} else if (e instanceof prototypes.StructureTower) {
		stats.attackPower = 15;
		stats.range = 10;
	} else if (e instanceof prototypes.StructureSpawn) {
		let cap = e.store.getCapacity(constants.RESOURCE_ENERGY);
		let usedCap = e.store.getUsedCapacity(constants.RESOURCE_ENERGY);
		if (cap != undefined && usedCap != undefined) {
			stats.attackPower = 30*usedCap/cap;
		}
		stats.range = 2;
	}

	return stats;
}