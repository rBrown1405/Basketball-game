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

module.exports = MAPS;
