# Animation research notes

The procedural animation in `js/match/` is tuned to measured human movement and NBA tracking data rather than
guessed. This file keeps the numbers the code targets and where they come from, so later tuning stays honest.

## Walking and running (actor.js, anims.js)

| Quantity | Target | Source |
|---|---|---|
| Walk stance / swing share | 60% / 40%, 10% double support at each end | AAPM&R normal gait: https://now.aapmr.org/biomechanics-normal-gait/ |
| Walking knee | ~3-5 deg at contact, ~15 deg loading, ~0-5 deg midstance, ~40 deg toe-off, ~60-65 deg peak swing | Physiopedia joint range during gait: https://www.physio-pedia.com/Joint_Range_of_Motion_During_Gait |
| Heel strike foot angle | toes ~20 deg up, then heel-to-toe roll | https://royalsocietypublishing.org/doi/10.1098/rsos.170818 |
| Walk cadence | walk ratio ~0.0065 m per step/min (scaled by height), ~100-120 steps/min | https://pmc.ncbi.nlm.nih.gov/articles/PMC5387837/ , https://www.sciencedirect.com/science/article/abs/pii/S0966636298000095 |
| Walk to run switch | ~2.0-2.1 m/s | https://www.sciencedirect.com/science/article/abs/pii/S0167945723000635 |
| Step width | 8-12 cm walking, 0-3 cm running | https://www.sciencedirect.com/topics/nursing-and-health-professions/stride-width |
| Running stance share | ~31-39% jog, ~22-25% sprint; knee ~20 deg at contact, up to ~125 deg in swing | https://pubmed.ncbi.nlm.nih.gov/10200378/ , https://www.physio-pedia.com/Running_Biomechanics |
| Vertical bounce | 4-5 cm walking (highest at midstance), 6-9 cm running (lowest at midstance) | https://pubmed.ncbi.nlm.nih.gov/15685471/ |
| Trunk lean | ~9 deg jogging, ~14 deg sprinting | https://www.sciencedirect.com/science/article/pii/S0167945721000658 |
| Arm swing | opposite the legs, nearly straight when walking, bent when running | https://journals.biologists.com/jeb/article/222/13/jeb197228/2704/ |
| Toddler traits to avoid | wide base, flat-foot landing, bent knees in stance, high cadence, arms up, big sway | https://pmc.ncbi.nlm.nih.gov/articles/PMC8946917/ |

## Joint limits (rig.js)

Active ranges of healthy adults (AAOS goniometry norms): shoulder flexion 180 / extension 60, abduction 180,
rotation 70 / 90; elbow 0-150 (no more than ~5 deg hyperextension); wrist 80 / 70; hip flexion 120-125 /
extension 30, abduction 45, rotation 45; knee 0-135 (hyperextension 0-5); ankle 20 / 50; trunk 80 / 25 / 35 / 45;
neck ~50 / 60 / 40 / 70. https://goniometer.io/range-of-motion , https://pubmed.ncbi.nlm.nih.gov/22510944/ (arm swivel).

## Dribbling (ball.js, actor.js)

| Quantity | Target | Source |
|---|---|---|
| Control dribble rate | 1.35-1.43 bounces/s | https://doi.org/10.2466/pms.110.2.469-478 , https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0238318 |
| Ball restitution | 0.76-0.78 (FIBA drop test) | https://assets.fiba.basketball/image/upload/documents-corporate-fiba-official-rules-2024-official-basketball-rules-and-basketball-equipment.pdf |
| Hand on the ball | ~40-55% of the cycle; ride up ~10-15 cm to hip height, push ~25-30 cm down | derived from the rates above |
| Elbow | ~100-120 deg flexed at the catch, ~35-55 deg at the release; elbow beside the body, not across the chest | https://www.academia.edu/1264533/ , https://www.active.com/basketball/articles/basic-dribbling-6 |
| Placement | outside the dribble-side foot, ~0.2 x height from the midline; pushed ahead when running; low (knee) when protected | https://www.coachesclipboard.net/Dribbling.html |
| Crossover | snapped across below the knee, a sharp V | https://xbotgo.com/blogs/knowledge/crossover-dribble |

## Shooting (anims.js, clips.js)

| Quantity | Target | Source |
|---|---|---|
| Catch to release | NBA average 0.54 s (Curry 0.40 s); pull-up 0.8-1.0 s | https://www.breakthroughbasketball.com/fundamentals/Shooting/three-components-of-a-quick-release.html |
| Knee at the bottom of the dip | ~99-101 deg included | https://www.researchgate.net/publication/337387656 , https://training-conditioning.com/news/study-biomechanical-traits-of-the-best-free-throw-shooters/ |
| Jump height | ~25-35 cm on a jump shot; release just before the apex | https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9465762/ |
| Release angle / height | ~50-55 deg, ~2.1 m (ball 30-60 cm above the head); elbow ~158 deg at release | https://www.physio-pedia.com/Biomechanics_of_the_Basketball_Jump_Shot |
| Free throw | ~52 deg, no jump, heels lift at the release | https://www.scientificamerican.com/article/the-math-behind-the-perfect-free-throw/ |
| Follow-through | held ~1 s (until the ball reaches the rim) | https://www.breakthroughbasketball.com/fundamentals/shooting-technique |
| Layup | right-left-jump off the inside foot, opposite knee up, two steps of ~0.25 s, 40-60 cm jump | https://www.coachesclipboard.net/Layup.html |
| Dunk | 70-100 cm jump, hang time ~0.75-0.9 s | https://www.thehoopsgeek.com/dunk-calculator/ |

## Defense, screens, rebounds, passes (choreo.js, poses.js, clips.js)

| Quantity | Target | Source |
|---|---|---|
| Defensive stance | feet wider than the shoulders, hips back, chest over the knees, knees ~120 deg included | https://www.breakthroughbasketball.com/defense/stance |
| Slide | never cross the feet; 2.5-3.5 m/s sustained; drop step / hip turn when beaten | https://ctyeh.com/articles/3139?lang=en |
| Closeout | sprint, then chop steps from ~8 ft, stop at arm's length, high hand | https://hoopmentality.com/blogs/basketball/explaining-defensive-closeouts-a-coachs-complete-guide |
| Contest | jump straight up at the release, ~0.15-0.25 s after the shooter starts up | https://official.nba.com/nba-rule-authority-restricted-area-and-verticality-plays/ |
| Screens | wide base, arms across the chest, hold 1-2 s, roll on contact | https://www.basketballhq.com/setting-screens-in-basketball |
| Rebound | box out, jump ~0.3-0.5 s after the rim, two hands, chin the ball, elbows out | https://www.breakthroughbasketball.com/fundamentals/rebounding-fundamentals-and-tips |
| Passes | 9-13 m/s chest, 14-17 m/s outlet, bounce pass hits the floor 2/3 of the way, windup 0.2-0.35 s | https://pmc.ncbi.nlm.nih.gov/articles/PMC13429921/ |
| On-ball / off-ball defender distance | ~5.4 ft on the ball; 4.2 / 6.8 / 8.9 / 11 ft one, two, three passes away | SportVU tracking analysis (2015-16, 7 games) |

## Half-court movement (flow.js)

From NBA SportVU tracking (2015-16 sample) and NBA.com team tracking: passes ~5.4 per 24 s of half-court time
(Warriors ~6.7, Rockets ~4.8); ~1 rim cut every 8 s; a perimeter relocation every ~2.6 s; off-ball players spend
23% / 44% / 21% / 11% / 1% of the time under 2 / 2-6 / 6-10 / 10-15 / over 15 ft/s; nearest teammate ~14 ft;
idle spells rarely over 3 s. Passes per possession by system: motion / Princeton ~3-3.4, isolation ~2.4-2.6.
https://github.com/linouk23/NBA-Player-Movements , https://github.com/gabriel1200/site_Data

## Player models and rendering (human.js, human_build.js, gl3d.js)

The realistic players start from the MakeHuman 1.1 base mesh, targets and skeleton weights, which the MakeHuman
project released under CC0 1.0 (https://github.com/makehumancommunity/makehuman, LICENSE.ASSETS.md).
`tools/human/build.js` converts them into `js/match/human_data.js`.

| Topic | What the code does | Source |
|---|---|---|
| Body shape | gender = average of MakeHuman's three race targets (no single ancestry baked in); muscle x weight grid with ideal proportions; identity face shapes (jaw, chin, cheekbones, eyes, nose, lips, ears, neck) from `PBC.Identity` | https://github.com/makehumancommunity/makehuman |
| Proportions | ANSUR II tall athletic men: neck girth .203 H, chest .537, waist .470, upper thigh .320, calf .202, biceps .181, forearm .161; bideltoid .266; acromion .826 H; arm segments from the shoulder joint centre | https://github.com/senihberkay/US-Army-ANSUR-II |
| Heads | head length ~200 mm barely grows with stature, so tall players' heads scale less than their bodies | ANSUR II (as above) |
| Twist | forearm pronation / humerus / femur rotation spread along the segment per vertex (no candy-wrapper) | https://users.cs.utah.edu/~ladislav/kavan07skinning/kavan07skinning.pdf |
| Skin | wrap diffuse with a red scatter band; two Beckmann lobes, F0 0.028, oilier and sharper with sweat | https://developer.nvidia.com/gpugems/gpugems/part-iii-materials/chapter-16-real-time-approximations-subsurface-scattering , https://developer.nvidia.com/gpugems/gpugems3/part-iii-rendering/chapter-14-advanced-techniques-realistic-real-time-skin |
| Skin tone | portrait tone kept for lightness, chroma pulled toward measured skin albedo (Fitzpatrick I-VI, linear sRGB) | https://github.com/AntonPalmqvist/physically-based-api |
| Cloth | wrap diffuse 0.5 and Charlie sheen (Filament cloth model) | https://raw.githubusercontent.com/google/filament/main/shaders/src/surface_shading_model_cloth.fs , https://blog.selfshadow.com/publications/s2017-shading-course/imageworks/s2017_pbs_imageworks_sheen.pdf |
| Hair | Kajiya-Kay with shifted tangents; the high-top is a sculpted cut about 5 cm tall with a shallow dome and rounded edges, not a box | https://web.engr.oregonstate.edu/~mjb/cs557/Projects/Papers/HairRendering.pdf |
| Eyes | sclera a warm off-white (~0.7, 0.6, 0.5), pinker toward the corners with faint vessels; iris with radial fibres, a lighter collarette round the pupil and a dark limbal ring; the upper lid and lashes shade the top third of the eyeball and the corners sit in the socket's shadow; a sharp catchlight from the camera side, a softer one from the overhead lights and a wet lower margin; lit mostly by the key and the warm floor bounce (the cool sky term alone turned the whites blue-grey) | https://github.com/Unity-Technologies/Graphics (HDRP EyeUtils), https://www.iryoku.com/open-your-eyes/ (Jimenez, SIGGRAPH 2012 Advances in Real-Time Rendering) |
| Lights | arena 1500-2000 lux, 5000-5700 K, camera white-balanced (neutral); overhead key, far fill, camera fill, warm maple bounce, rim | https://sportsvenuecalculator.com/knowledge/led-sports-lighting/basketball-court-lighting/ , https://steamcdn-a.akamaihd.net/apps/valve/2007/NPAR07_IllustrativeRenderingInTeamFortress2.pdf |
| Tone map | Khronos PBR Neutral (keeps team colours) | https://github.com/KhronosGroup/ToneMapping/tree/main/PBR_Neutral |
| Uniform | shorts waistband ~0.61 H, hem just above the knee (~0.3 H); jersey tucked; loose drape by smoothing an offset of the body; the team wordmark arched across the chest above the number (the nickname on the home whites, the city on the road) | ANSUR II landmarks (as above) |
| Garment edges | neckline, arm holes and hems are distances measured along the body surface (the outline field divided by its surface gradient), so ~1 in bindings are the same width everywhere; the straps run unbroken over the shoulders; bindings hug the body so no gap opens onto the hidden skin | https://www.footlocker.co.uk/en/inspiration/a/shoe-anatomy-guide.html (garment and shoe anatomy terms), Filament cloth model (as above) |
| Shorts crotch | the fork sits at the real crotch on the midline; below it the two leg tubes meet at the midline without crossing, the front and back panels run flat across them, and any fold of the offset cloth is relaxed until no triangle faces the wrong way ; where the two leg tubes bunch together under the fork the cloth is shaded as the soft drape it is (normals eased toward the front and back panels) | (geometry) |
| Shoes | high-top basketball sneaker: ~1.1 in midsole a touch wider than the upper, outsole wrapping up at toe and heel, rounded toe box, heel counter and pull tab, padded collar sized to clear the ankle and Achilles, tongue; outsole, midsole groove, laces, eyelets, overlays, side stripe and stitching drawn per pixel from shoe-local coordinates | https://www.footlocker.co.uk/en/inspiration/a/shoe-anatomy-guide.html , https://blog.finishline.com/2013/11/19/sneaker-glossary/ |
| Tattoo sleeves | three kinds: black-and-grey sleeves (a few shaded focal pieces joined by smoke, each held in the light glow artists leave around it so it reads), patchwork sleeves (separate pieces on bare skin) and tribal blades that taper to points; the pieces are drawn like real flash: roses with petals shaded dark where they tuck under, pocket watches, skulls with black sockets, nautical stars and compass roses split into dark and bare halves, crowns, dotwork mandalas, script banners; the ink fades in at the shoulder, stops in a clean line an inch above the wrist and leaves a thin strip along the inside of the arm where the pattern wraps | https://46tattoo.com/blogs/news/black-and-grey-sleeve-tattoo-ideas , https://zentattoostudio.com/zenblog/sleeve-tattoo-ideas-for-men-black-amp-grey-realism-themes-that-work , https://ragtimetattoo.com/tattoo-sleeve-mistakes-that-can-ruin-your-design/ |
| Ambient occlusion | baked per vertex when the data is built: 40 cosine-weighted rays per vertex against the body's own triangles, and each part (head, neck, trunk, arms, legs) is shadowed only by itself and its neighbours, so creases (eye sockets, nostrils, lip corners, ears, under the jaw, armpits, the backs of the knees) darken but a limb that moves in the game leaves no stale shadow; it dims the arena's fill lights as well as the ambient (the self-shadow map is too coarse for eye sockets and nostrils); cloth gets a softened copy because it hangs off the body | https://download.nvidia.com/developer/GPU_Gems_2/GPU_Gems2_ch14.pdf , https://developer.nvidia.com/gpugems/gpugems2/part-ii-shading-lighting-and-shadows/chapter-14-dynamic-ambient-occlusion-and |
| Face colour | the three colour zones of a face: cheeks, nose tip and ears a little flushed (more blood near the surface), the skin under the eyes a little darker and cooler, strongest on light skin where it shows; lips two-toned (upper lip a shade darker), a dark line where they meet, the corners tucked in and a wet sheen on the lower lip | https://gurneyjourney.blogspot.com/2008/05/color-zones-of-face.html |
| Brows | fine hairs about 6 mm long lying along the brow, dense on the centre line and thinning to bare skin at the edges and the tail, instead of a painted band | (rendering) |
| Sweat | players start with a light sheen and glisten more the longer and harder they play; the sweat film adds its own sharp reflection (roughness ~0.08) in beads and streaks and darkens the skin a touch where it is wet | https://graphics.stanford.edu/courses/cs348b-competition/cs348b-04/skin/index.html , https://dev.epicgames.com/documentation/unreal-engine/creating-human-skin-in-unreal-engine |
| Build | pros carry more muscle than an average fit person: the default body sits near MakeHuman's max-muscle shape with extra deltoid, lat, chest and arm definition, and the player's muscle rating moves it up or down | https://github.com/makehumancommunity/makehuman |

## Broadcast and watch-sim realism

| Topic | Notes | Source |
|---|---|---|
| Game camera | mid-level at centre court, wide enough for all ten players, moves little; fans reject swaying / zooming experiments | https://www.sportsvideo.org/2018/03/31/live-from-final-four-camera-op-janis-murray-makes-history-taking-over-main-game-camera-position/ , https://awfulannouncing.com/nba/trying-to-make-a-big-game-feel-bigger-with-experimental-camera-angles-isnt-worth-it.html |
| Camera pan | follows the players' formation more than the ball, with lead room and smooth, purposeful motion | https://openaccess.thecvf.com/content_cvpr_2016/papers/Chen_Learning_Online_Smooth_CVPR_2016_paper.pdf |
| Replays | 4x-6x slow motion for highlights, in dead time only | https://smt.com/nba-finals-espn-caps-23rd-nba-season-with-tech-fueled-productions-in-okc-and-indy/ |
| Pace | ~98.8 possessions per 48 min, ~14.5 s per possession; free throw 10 s limit | https://fantasyteamadvice.com/nba/game-pace-data-today , https://videorulebook.nba.com/archive/free-throw-violation-shooter-takes-more-than-10-seconds-to-shoot |
| Sim complaints | skating feet, floaty balls, passive defenders, bodies overlapping, repetitive animation; praise for planted feet and steady TV framing | https://steamcommunity.com/app/3551340/discussions/0/506217282369883622/ , https://nba.2k.com/2k26/courtside-report/gameplay/ |

## Motion and contact fixes from the motion audit

| Topic | What the code does | Source |
|---|---|---|
| Sideways / backpedal gait | a defensive or offensive shuffle keeps the arms quiet (no jog arm swing at shuffle cadence) and the torso still; forward, sideways and backward gait parameters are blended by direction instead of switched | https://www.breakthroughbasketball.com/defense/Debunking-Cross-Feet , https://theorangeduck.com/page/spring-roll-call |
| Body contact | capsule-style push-out on pelvis and chest (torsos lean ahead of the feet), a hard floor, and the closing velocity cancelled at contact so steering slides players around each other | https://www.red3d.com/cwr/papers/1999/gdc99steer.html , https://www.nature.com/articles/35035023 |
| Spacing | off-ball spot targets that sit on top of the ball handler move out to ~14 ft | https://fivethirtyeight.com/features/how-nba-teams-are-bringing-the-post-up-back-to-life |
| Transition lanes | up the floor after a rebound, a steal, a make or the tip, whoever is headed for a wing or a corner runs a wide lane ~4-5 ft off the sideline ahead of the ball, the rim runner takes the middle to the basket, the trailer comes up behind the ball (never backing up); each peels off to his half-court spot once level with it; the scorers get back spread across the floor, guards higher, bigs to the paint | https://www.coachesclipboard.net/TransitionOffense.html , https://hooptactics.net/premium/offense/earlyoffense/earlynumberbreak.php , https://www.basketballforcoaches.com/fast-break-basketball/ |
| One player per spot | when a play moves someone to a spot (cutter to the wing, post-up to the block, handoff screener to the high post, the ball screener to the elbow), whoever stood there takes his old spot instead of both running to the same place | (spacing audit) |
| Getting back on defense | in transition a defender sprints facing the basket he protects, eyes on the ball over his shoulder, and squares up to his man around the three-point line; squared up he backpedals and slides at ~13 ft/s at most | https://www.basketballforcoaches.com/fast-break-basketball/ , https://ctyeh.com/articles/3139?lang=en |
| Overhead reach | scapulohumeral rhythm: raising the arm past ~70 deg elevates the shoulder girdle (the joint rises ~6-7 cm at full reach) | https://www.physio-pedia.com/Scapulohumeral_Rhythm , https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4740470/ |
| Ball in hand | the ball is carried where the hands can hold it when a scripted grip is out of reach; one-hand finishes rest the ball on the palm above the wrist | https://newsroom.2k.com/news/nba-2k21-next-generation-movement-and-impact-engine-revealed-in-second-courtside-report |
| Dunks | thrown down at the rim: a standing putback dunk only from close in, otherwise a short running dunk whose run-up absorbs the distance | https://nba.2k.com/2k26/courtside-report/gameplay/ |
| Free throws | the official catches the ball out of the net and walks to the lane before bouncing it to the shooter (~16 s between free throws in the NBA, compressed) | https://thef5.substack.com/p/long-time-short-king |
| Camera | the ball always stays inside the middle ~60 % of the frame; faster pans when it runs out of the picture | https://openaccess.thecvf.com/content_cvpr_2016/papers/Chen_Learning_Online_Smooth_CVPR_2016_paper.pdf |

## Motion capture (tools/mocap, clips_mocap.js)

Real captures from the CMU Graphics Lab Motion Capture Database (free for research and commercial use; BVH release by
Bruce Hahne) are retargeted onto the rig by `tools/mocap/retarget.js`: pelvis, spine, chest, neck and head from each
joint's rotation relative to the take's T-pose, arms and legs from bone directions (so the captured person's
proportions do not matter; limb directions match the capture to ~0.1 deg median), the facing from the pelvis
heading, the root from the pelvis's ground point, and the feet's real contacts turned into planted phases and
scripted steps (pivots become zero-lift steps about the ball of the foot) so planted feet never slide. The data used
in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217.
https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/master/READMEFIRST.txt

| Take | Use | Notes |
|---|---|---|
| 102_11 (OffensiveMoveSpinLeft) | the spin move (`spinMocap`) | low stance, a hop into the pivot, ~260 deg of rotation in ~1.1 s with the real footwork; replaces the three-key procedural spin |
| 102_27 (DefensiveMoveSideToSide) | tuning of the defensive slide and stances | at 10-12 ft/s a slide is a lateral bound (both feet land nearly together ~2 times a second, a brief flight on each push-off) with the gap between the feet swinging ~0.14-0.66 H; hips ~0.115 H below standing, hip abduction ~35 deg, knees 58-96 deg, arms out with elbows bent ~75 deg. The slide's steps are now ~25% slower and the stance lower and wider with the low hand's elbow bent |
| 102_10, 09_01, 09_05, 16_35, 16_55 (runs, 10-18 ft/s) | check of the jog and sprint cycles | the captured runners swing the upper arm ~35-45 deg back but only ~10-20 deg in front of the trunk (ours reached +46 jogging, +68 sprinting) and tuck the knee to ~106-117 deg at 10-13 ft/s; the arm cycles now swing mostly behind the body (-44/+22 jogging, -58/+36 sprinting), the swing foot rises a little less, the midstance dip is a little deeper. Cadence (~2.7-3.3 steps/s), stride, trunk lean and elbow bend already matched |
| 124_04 / 124_05 / 124_06 (free throw, jump shot, lay up) | reviewed, not used | an amateur's form (a deep bend-over gather); the research-tuned shooting clips stay |

## Transitions without pops (rig.js, actor.js, ball.js, choreo.js)

A per-frame tracer over live possessions (joint accelerations relative to the body, with what changed in the
frames before each spike) found the remaining pops came from switches, not from the motion itself: hand IK
turning on or off in one frame, grips and stances swapping, the shoulder IK flipping to its other equivalent
solution, landing spots re-predicted wildly, and airborne legs handed from IK to the clip at take-off.

| Topic | What the code does | Source |
|---|---|---|
| Inertialization | torso, neck, head and the arms' authored channels: a change the channel's own velocity does not explain becomes an offset that dies away with a critically damped spring (~0.2 s); the same for legs leaving the floor at take-off | https://www.gdcvault.com/play/1025331/Inertialization-High-Performance-Animation-Transitions , https://media.gdcvault.com/gdc2018/presentations/bollo_david_inertialization_high_performance.pdf , https://theorangeduck.com/page/dead-blending , https://theorangeduck.com/page/spring-roll-call |
| Arm IK blending | the IK weight ramps over ~0.12 s; a partial weight blends where the wrist goes (and where the elbow points) and solves the arm fully, instead of lerping two sets of joint angles | https://www.youtube.com/watch?v=BYyv4KTegJI |
| Shoulder solution | of the two equivalent Euler solutions, the one inside the shoulder's range of motion is kept, then the one nearest the arm's last pose (the other often had its twist past the limit, and clamping it bent the arm the wrong way) | https://www.physio-pedia.com/Scapulohumeral_Rhythm |
| Grips | a grip change moves the hand around the ball (the grip offset is smoothed relative to the ball, so a hand never trails a ball it holds); grip to dribble crossfades; a plain hold keeps the elbows down and out with the palms on the sides of the ball | https://newsroom.2k.com/news/nba-2k21-next-generation-movement-and-impact-engine-revealed-in-second-courtside-report |
| Catching | the hands go out to meet a pass in its last ~0.3 s and a loose ball just before a rebound or pickup grab | https://us.humankinetics.com/blogs/excerpt/principles-of-passing-and-catching , https://www.coachesclipboard.net/Passing.html |
| Landing spots | a braking player's predicted position stops instead of reversing; a foot in the air re-aims at a limited rate; the stride's shape follows speed changes over ~0.1 s | https://theorangeduck.com/page/spring-roll-call |
| Toe-off | a stance foot left behind the hip and out of reach even up on its toes lifts a little before its scheduled toe-off (dragging it read as skating) | https://www.physio-pedia.com/Running_Biomechanics |
| Landing | an airborne foot lands toes first with the heel up, where the animated foot is, and settles over a few frames | https://pmc.ncbi.nlm.nih.gov/articles/PMC10579024/ , https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2025.1676448/full |
| Contact | a light touch between players takes the closing speed off over ~0.1 s, a deep one at once | https://www.red3d.com/cwr/papers/1999/gdc99steer.html |
| Inbounds after a make | the inbounder catches the ball as it drops out of the net or picks it up once it is on the floor | https://hoopstudent.com/basketball-inbound-pass/ , https://videorulebook.nba.com/archive/inbound-violation-takes-more-than-5-secs-to-inbound |

