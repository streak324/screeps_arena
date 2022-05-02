
import { prototypes, visual, constants, utils} from "game";
import { State, UnitCluster } from "types";

//the squared value of the max tiles that an archer can reach, plus one tile for move
const MIN_CLUSTER_RANGE = 5;

export function predictEnemy(e: prototypes.StructureSpawn|prototypes.Creep|prototypes.StructureTower|prototypes.StructureRampart, state: State, enemyLabelViz: visual.Visual, enemyClusters: Array<UnitCluster>) {
	if (state.debug) {
		let style: TextStyle = {
			font: 0.7,
			color: "#0000ff",
		}
		enemyLabelViz.text("e" + e.id, e, style);
	}
	let unitPower = 0;
	let mass = 1;
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
				break;
			};
		});

		// numMove => relieved fatigue. (totalParts - numMove) * 5 => generated fatigue
		let generatedFatigue = (e.body.length - movePartCnt) * 5;
		mass = 1.0 + 2*Math.min(1.0, rangePartCnt) + Math.min(1.0, healPartCnt) + 2*Math.min(1.0, movePartCnt / Math.max(1.0, generatedFatigue));
		unitPower = 3*attackPartCnt + rangePartCnt * movePartCnt + healPartCnt * movePartCnt;

	} else if (e instanceof prototypes.StructureRampart) {
		unitPower = 20;
	} else if (e instanceof prototypes.StructureTower) {
		unitPower = 20;
		mass = 4;
	} else if (e instanceof prototypes.StructureSpawn) {
		let cap = e.store.getCapacity(constants.RESOURCE_ENERGY);
		let usedCap = e.store.getUsedCapacity(constants.RESOURCE_ENERGY);
		if (cap != undefined && usedCap != undefined) {
			unitPower = 30*usedCap/cap;
		}
		mass = 2;
	}

	let bestCluster: UnitCluster | undefined;
	let highestDensity = 0.0;
	enemyClusters.forEach(cluster => {
		//check if enemy is overlapping with the cluster bounds, 
		if (e.x >= cluster.centerMass.x-MIN_CLUSTER_RANGE && e.x <= cluster.centerMass.x + MIN_CLUSTER_RANGE && e.y >= cluster.centerMass.y-MIN_CLUSTER_RANGE && e.y <= cluster.centerMass.y + MIN_CLUSTER_RANGE) {
			let newMax: prototypes.RoomPosition = {
				x: Math.max(e.x, cluster.max.x),
				y: Math.max(e.y, cluster.max.y),
			};
			let newMin: prototypes.RoomPosition = {
				x: Math.min(e.x, cluster.min.x),
				y: Math.min(e.y, cluster.min.y),
			};

			let newArea = (newMax.x - newMin.x + 1) * (newMax.y - newMin.y + 1);
			let newMass = cluster.mass + mass;

			let density  = newMass / newArea;
			if (highestDensity < density) {
				bestCluster = cluster; 
			}
		} else if (e.x >= cluster.min.x-MIN_CLUSTER_RANGE && e.x <= cluster.max.x + MIN_CLUSTER_RANGE && e.y >= cluster.min.y-MIN_CLUSTER_RANGE && e.y <= cluster.max.y + MIN_CLUSTER_RANGE) {
			//TODO: breakup cluster when enemy is within bounds, but not within center of mass
		}
	});

	if (bestCluster === undefined) {
		let pos: prototypes.RoomPosition = { x: e.x, y: e.y };
		let newCluster: UnitCluster = {
			id: enemyClusters.length,
			min: pos,
			max: pos,
			centerMass: pos,
			power: unitPower,
			units: new Array(e),
			mass: mass,
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
		bestCluster.power += unitPower;
		bestCluster.mass += mass;
		let ratio = 1.0/(bestCluster.units.length + 1.0);
		let sumX = e.x;
		let sumY = e.y;
		bestCluster.units.forEach(i => {
			sumX += i.x;
			sumY += i.y;
		});
		bestCluster.centerMass = {
			x: sumX * ratio,
			y: sumY * ratio,
		};
		bestCluster.units.push(e);
		return bestCluster;
	}
}