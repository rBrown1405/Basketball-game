// Which joints of a motion capture skeleton stand for which parts of ours (js/match/rig.js), per skeleton.
// up: the file's up axis. Torso parts take the world rotation of the listed joint (two: halfway between them),
// measured from the take's rest pose; limbs take the directions between the listed joints; hands and feet take the
// listed joint's rotation from its rest (the thumb, the finger and the foot's flat forward axis). forearm: the joint
// whose rotation carries the forearm's turn (CMU's wrist joint); hand: the one that carries the hand's bend.
'use strict';

const MAPS = {
  // CMU Graphics Lab Motion Capture Database, as converted to BVH by B. Hahne (cgspeed): Y up, the rest pose a
  // T-pose facing +Z with the palms down and the legs a little apart
  cmu: {
    up: 'y',
    pelvis: ['Hips'], spine: ['LowerBack', 'Spine'], chest: ['Spine1'], neck: ['Neck', 'Neck1'], head: ['Head'],
    l: {
      hip: 'LeftUpLeg', knee: 'LeftLeg', ankle: 'LeftFoot', ball: 'LeftToeBase', toe: 'LeftToeBase_End',
      shoulder: 'LeftArm', elbow: 'LeftForeArm', wrist: 'LeftHand', forearm: 'LeftHand', hand: 'LeftFingerBase', fingerJ: 'LeftHandIndex1', finger: 'LeftHandIndex1_End', thumb: 'LThumb_End',
    },
    r: {
      hip: 'RightUpLeg', knee: 'RightLeg', ankle: 'RightFoot', ball: 'RightToeBase', toe: 'RightToeBase_End',
      shoulder: 'RightArm', elbow: 'RightForeArm', wrist: 'RightHand', forearm: 'RightHand', hand: 'RightFingerBase', fingerJ: 'RightHandIndex1', finger: 'RightHandIndex1_End', thumb: 'RThumb_End',
    },
  },
  // Epic's UE4 mannequin skeleton (marketplace packs "rigged to the Epic skeleton"), as Blender exports it to BVH
  // (tools/mocap/fbx2bvh.py): Z up; the forearm's turn is on lowerarm_l (the twist bones only share it out for the skin)
  ue4: {
    up: 'z',
    pelvis: ['pelvis'], spine: ['spine_01', 'spine_02'], chest: ['spine_03'], neck: ['neck_01'], head: ['head'],
    l: {
      hip: 'thigh_l', knee: 'calf_l', ankle: 'foot_l', ball: 'ball_l', toe: 'ball_l_End',
      shoulder: 'upperarm_l', elbow: 'lowerarm_l', wrist: 'hand_l', forearm: 'lowerarm_l', hand: 'hand_l', fingerJ: 'middle_01_l', finger: 'middle_01_l', thumb: 'thumb_01_l',
    },
    r: {
      hip: 'thigh_r', knee: 'calf_r', ankle: 'foot_r', ball: 'ball_r', toe: 'ball_r_End',
      shoulder: 'upperarm_r', elbow: 'lowerarm_r', wrist: 'hand_r', forearm: 'lowerarm_r', hand: 'hand_r', fingerJ: 'middle_01_r', finger: 'middle_01_r', thumb: 'thumb_01_r',
    },
  },
};
// (the UE5 mannequin names its spine spine_01 to spine_05 and its neck neck_01, neck_02; the rest is the UE4 names)
MAPS.ue5 = Object.assign({}, MAPS.ue4, { spine: ['spine_02', 'spine_03'], chest: ['spine_05'], neck: ['neck_01', 'neck_02'] });

/** Mixamo's skeleton (Adobe), its bone names behind a prefix ('mixamorig:' as Blender imports them). Not yet tried on
 *  a real file. */
function mixamo(p) {
  const side = (s) => {
    const S = s === 'l' ? 'Left' : 'Right';
    return {
      hip: p + S + 'UpLeg', knee: p + S + 'Leg', ankle: p + S + 'Foot', ball: p + S + 'ToeBase', toe: p + S + 'Toe_End',
      shoulder: p + S + 'Arm', elbow: p + S + 'ForeArm', wrist: p + S + 'Hand', forearm: p + S + 'ForeArm', hand: p + S + 'Hand',
      fingerJ: p + S + 'HandMiddle1', finger: p + S + 'HandMiddle1', thumb: p + S + 'HandThumb1',
    };
  };
  return { up: 'y', pelvis: [p + 'Hips'], spine: [p + 'Spine', p + 'Spine1'], chest: [p + 'Spine2'], neck: [p + 'Neck'], head: [p + 'Head'], l: side('l'), r: side('r') };
}

/** which map a take's joints fit, by their names: { name, map } or null */
MAPS.detect = function (names) {
  const has = (n) => names.indexOf(n) >= 0;
  if (has('thigh_l') && has('spine_05')) return { name: 'ue5', map: MAPS.ue5 };
  if (has('thigh_l') && has('spine_03')) return { name: 'ue4', map: MAPS.ue4 };
  if (has('LeftUpLeg') && has('Spine1') && has('LThumb')) return { name: 'cmu', map: MAPS.cmu };
  const hips = names.find(n => /Hips$/.test(n) && names.indexOf(n.replace(/Hips$/, 'LeftUpLeg')) >= 0 && names.indexOf(n.replace(/Hips$/, 'Spine2')) >= 0);
  if (hips) return { name: 'mixamo', map: mixamo(hips.replace(/Hips$/, '')) };
  return null;
};

module.exports = MAPS;
