
import { prototypes, visual, constants, utils} from "game";
import * as types from "./types";

export function putIntoCluster(e: prototypes.StructureSpawn|prototypes.Creep|prototypes.StructureTower|prototypes.StructureRampart, state: types.State, creepViz: visual.Visual, clusters: Array<types.UnitCluster>) {
	if (state.debug) {
		let style: TextStyle = {
			font: 0.7,
			color: "#0000ff",
		}
		creepViz.text("c" + e.id, e, style);
	}

	let unitStats = getUnitStats(e);

	let bestCluster: types.UnitCluster | undefined;
	let bestDist: number = 9999999;
	clusters.forEach(cluster => {
		//check if enemy is overlapping with the cluster bounds, 
		let closestUnit = e.findClosestByRange(cluster.units);
		if (closestUnit == undefined) {
			console.log("cluster", cluster.id, "has no units. wtf");
			return;
		}
		let maxRange = getUnitStats(closestUnit).range + unitStats.range;
		
		if (e.x >= cluster.centerPower.x-unitStats.range && e.x <= cluster.centerPower.x + unitStats.range && e.y >= cluster.centerPower.y-unitStats.range && e.y <= cluster.centerPower.y + unitStats.range) {
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
			id: clusters.length,
			min: pos,
			max: pos,
			centerPower: pos,
			attackPower: unitStats.attackPower,
			healPower: unitStats.healPower,
			hits: unitStats.hits,
			units: new Array(e),
		}
		clusters.push(newCluster);
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
		let weight = (1.0 + unitStats.attackPower)/(1.0 + bestCluster.attackPower + unitStats.attackPower);
		bestCluster.centerPower = {
			x: (1 - weight) * bestCluster.centerPower.x + weight * e.x,
			y: (1 - weight) * bestCluster.centerPower.y + weight * e.y,
		};
		bestCluster.attackPower += unitStats.attackPower;
		bestCluster.healPower += unitStats.healPower;
		bestCluster.hits += unitStats.hits;
		bestCluster.units.push(e);
		return bestCluster;
	}
}

export function debugDrawClusters(clusters: Array<types.UnitCluster>, creepViz: visual.Visual, colorFill: string) {
		clusters.forEach(cluster => {
			let topleft: prototypes.RoomPosition = {
				x: cluster.min.x-0.5,
				y: cluster.min.y-0.5,
			}
			let topleftpad: prototypes.RoomPosition = {
				x: cluster.min.x-1.5,
				y: cluster.min.y-1.5,
			}
			let style: PolyStyle = {
				fill: colorFill,
				lineStyle: "solid",
			}
			let padStyle: PolyStyle = {
				fill: "#ffffff",
				lineStyle: "solid",
				opacity: 0.2,
			}
			creepViz.rect(topleftpad, cluster.max.x - cluster.min.x+3, cluster.max.y - cluster.min.y+3, padStyle);
			creepViz.rect(topleft, cluster.max.x - cluster.min.x+1, cluster.max.y - cluster.min.y+1, style);

			let centerCircleStyle: CircleStyle = {
				radius: 0.2,
				opacity: 1.0,
				fill: "#0f0f0f",
			}
			creepViz.circle(cluster.centerPower, centerCircleStyle);

			let textStyle: TextStyle = {
				font: 0.5,
				color: "#ffffff",
				backgroundColor: "#80808080",
			}
			let text = "C" + cluster.id + ": ";
			cluster.units.forEach(e => {
				text += e.id + ", ";
			});
			text +="\nAttack: " + cluster.attackPower;
			text +="\nHeal: " + cluster.healPower;
			text +="\nHits: " + cluster.hits;
			let centerTop: prototypes.RoomPosition = {
				x: cluster.min.x + (cluster.max.x - cluster.min.x) / 2,
				y: cluster.min.y-1,
			} 
			creepViz.text(text, centerTop, textStyle);
			console.log(cluster.id, cluster.centerPower);
		});
}

function getUnitStats(e: prototypes.StructureSpawn|prototypes.Creep|prototypes.StructureTower|prototypes.StructureRampart): types.UnitStats {
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