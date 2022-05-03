
import { prototypes, visual, constants, utils} from "game";
import * as types from "./types";

export function predictEnemy(e: prototypes.StructureSpawn|prototypes.Creep|prototypes.StructureTower|prototypes.StructureRampart, state: types.State, enemyLabelViz: visual.Visual, enemyClusters: Array<types.UnitCluster>) {
	if (state.debug) {
		let style: TextStyle = {
			font: 0.7,
			color: "#0000ff",
		}
		enemyLabelViz.text("e" + e.id, e, style);
	}

	let powerAndRange = getUnitPowerAndRange(e);

	let bestCluster: types.UnitCluster | undefined;
	let bestDist: number = 9999999;
	enemyClusters.forEach(cluster => {
		//check if enemy is overlapping with the cluster bounds, 
		let closestUnit = e.findClosestByRange(cluster.units);
		if (closestUnit == undefined) {
			console.log("cluster", cluster.id, "has no units. wtf");
			return;
		}
		let maxRange = getUnitPowerAndRange(closestUnit).range + powerAndRange.range;
		
		if (e.x >= cluster.centerPower.x-powerAndRange.range && e.x <= cluster.centerPower.x + powerAndRange.range && e.y >= cluster.centerPower.y-powerAndRange.range && e.y <= cluster.centerPower.y + powerAndRange.range) {
			let dist = e.getRangeTo(cluster.centerPower); 
			if (bestCluster === undefined || dist < bestDist) {
				bestCluster = cluster; 
				bestDist = dist;
			}
		} else if (e.x >= closestUnit.x-maxRange && e.x <= closestUnit.x + maxRange && e.y >= closestUnit.y-maxRange && e.y <= closestUnit.y + maxRange) {
			//TODO: breakup cluster when enemy is within bounds, but not within center of mass
		}
	});

	if (bestCluster === undefined) {
		let pos: prototypes.RoomPosition = { x: e.x, y: e.y };
		let newCluster: types.UnitCluster = {
			id: enemyClusters.length,
			min: pos,
			max: pos,
			centerPower: pos,
			power: powerAndRange.power,
			units: new Array(e),
		}
		enemyClusters.push(newCluster);
	} else {
		let newMax: prototypes.RoomPosition = {
			x: Math.max(e.x, bestCluster.max.x),
			y: Math.max(e.y, bestCluster.max.y),
		};
		let newMin: prototypes.RoomPosition = {
			x: Math.min(e.x, bestCluster.min.x),
			y: Math.min(e.y, bestCluster.min.y),
		};
		bestCluster.max = newMax;
		bestCluster.min = newMin;
		bestCluster.power += powerAndRange.power;
		let weight = (1.0 + powerAndRange.power)/(1.0 + bestCluster.power + powerAndRange.power);
		bestCluster.centerPower = {
			x: (1 - weight) * bestCluster.centerPower.x + weight * e.x,
			y: (1 - weight) * bestCluster.centerPower.y + weight * e.y,
		};
		bestCluster.units.push(e);
		return bestCluster;
	}
}

function getCreepUnitStats(i: prototypes.Creep): types.CreepUnitStats{
	let rangePartCnt = 0;
	let attackPartCnt = 0;
	let healPartCnt = 0;
	let movePartCnt = 0;
	i.body.forEach(p => {
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
	let generatedFatigue = (i.body.length - movePartCnt) * 5;
	let stats: types.CreepUnitStats = {
		range: 2.0 + 2.0 * Math.max(Math.min(1.0, rangePartCnt) + Math.min(1.0, healPartCnt)) + Math.min(1.0, movePartCnt / Math.max(1.0, generatedFatigue)),
		attackPower: 30 * attackPartCnt + 10 * rangePartCnt,
		healPower: 12 * healPartCnt,
		moveSpeed: Math.min(1.0, movePartCnt / Math.max(generatedFatigue)),
	};
	return stats;
}

function getUnitPowerAndRange(e: prototypes.StructureSpawn|prototypes.Creep|prototypes.StructureTower|prototypes.StructureRampart): types.UnitPowerRange {
	let unitPower = 0;
	let range = 1;
	if (e instanceof prototypes.Creep) {
		let stats = getCreepUnitStats(e);
		range = stats.range;
		unitPower = stats.attackPower + stats.healPower;
	} else if (e instanceof prototypes.StructureRampart) {
		unitPower = 20;
	} else if (e instanceof prototypes.StructureTower) {
		unitPower = 20;
		range = 50;
	} else if (e instanceof prototypes.StructureSpawn) {
		let cap = e.store.getCapacity(constants.RESOURCE_ENERGY);
		let usedCap = e.store.getUsedCapacity(constants.RESOURCE_ENERGY);
		if (cap != undefined && usedCap != undefined) {
			unitPower = 30*usedCap/cap;
		}
		range = 2;
	}

	let powerRange: types.UnitPowerRange = {
		power: unitPower,
		range: range,
	};
	return powerRange;
}