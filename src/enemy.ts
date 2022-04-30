
import { prototypes, visual, constants, utils} from "game";
import { State, UnitCluster } from "types";

//the squared value of the max tiles that an archer can reach
const MIN_CLUSTER_RANGE = 3;

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
					mass += 1;
				break;
				case constants.HEAL:
					healPartCnt++;
					mass += 1;
				break;
				case constants.MOVE:
					mass += 1;
				break;
			};
		});
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

	const MIN_UNIT_DENSITY = 0.8;

	let bestCluster: UnitCluster | undefined;
	let highestDensity = 0.0;
	enemyClusters.forEach(cluster => {
		if (e.x >= cluster.min.x-MIN_CLUSTER_RANGE && e.x <= cluster.max.x + MIN_CLUSTER_RANGE && e.y >= cluster.min.y-MIN_CLUSTER_RANGE && e.y <= cluster.max.y + MIN_CLUSTER_RANGE) {
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
			if (density > MIN_UNIT_DENSITY && highestDensity < density) {
				bestCluster = cluster; 
			}
		}
	});

	if (bestCluster === undefined) {
		let newCluster: UnitCluster = {
			id: enemyClusters.length,
			min: {
				x: e.x,
				y: e.y,
			},
			max: {
				x: e.x,
				y: e.y,
			},
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
		bestCluster.units.push(e);
		return bestCluster;
	}
}