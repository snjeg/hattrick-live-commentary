# CHPP match event types (official documentation, copied by the owner)

EventKey in the XML is `<EventTypeID>_<variant>`. The variant (1-5) is not documented; it appears to choose between text variants (and for 21/24/28/598 etc. it differs per match). Treat the type ID as the meaning and keep the variant as data.

## Field meaning
Generally SubjectTeamId = team the event belongs to, SubjectPlayerId = main player, ObjectPlayerId = other player. Exceptions:

| EventTypeID | SubjectPlayerId | ObjectPlayerId | SubjectTeamId |
|---|---|---|---|
| 23, 24 | Home lineup code | Away lineup code | |
| 25 | | Region ID | |
| 27 | Home team ID | Away team ID | |
| 30-33 | Arena ID | Sold seats | Seats in total |
| 35 | Arena ID | Temporary seats | |
| 40 | | Midfield possession (%) | |
| 61 | Organisation level | | |
| 64 | Trainer ID | Organisation level | |
| 68 | Pressing tactic level | | |
| 75 | | Added minutes | |
| 331-336 | Tactic level | | |
| 451 | | Cup ID | |
| 454 | | Injury weeks | |
| 456 | | Goals ever | |
| 457 | | Goals this league | |
| 458 | | Goals this cup | |
| 464 | | Sold seats | |
| 465 | 1st place league team ID | | |
| 466 | | 2nd place league team ID | |
| 468 | 6th place league team ID | | |
| 469 | | 7th place league team ID | |

Lineup codes (23/24): 1 + defenders(2 digits) + midfielders(2) + attackers(2), e.g. 1030502 = 3-5-2.
Event 550 is NOT in the documentation (seen in real data, empty text, small numbers in player fields).

## Events (SE = special event)
### Pre-match and info
19 Players enter the field; 20 Tactical disposition; 21 Player names in lineup; 22 Players from neighbourhood used; 23 Same formation both teams; 24 Team formations (different); 25 Regional derby; 26 Neutral ground; 27 Away is actually home; 28 Walkover lineup used
30 Spectators/venue rain; 31 cloudy; 32 fair; 33 sunny; 35 Arena extended with temporary seats
36 Only venue rain; 37 cloudy; 38 fair; 39 sunny
### During/after
40 Dominated; 41 Best player; 42 Worst player; 43 Double meeting first match; 44 Double meeting second match; 45 Half time results; 46 Hat-trick comment; 47 No team dominated
55 Penalty contest: goal by technical (no nerves); 56 goal, no nerves; 57 goal in spite of nerves; 58 no goal because of nerves; 59 no goal in spite of no nerves
60 Underestimation; 61 Organization breaks; 62 Withdraw; 63 Remove underestimation at pause; 64 Reorganize; 65 Nerves in important thrilling game; 66 Remove underestimation at pause (goaldiff 0); 67 (goaldiff 1); 68 Successful pressing; 69 Remove underestimation
70 Extension; 71 Penalty contest (after extension); 72 Extension decided; 73 After 22 penalties tossing coin; 74 Extension, double meeting second match; 75 Added time; 76 No added time
80 New captain; 81 New set pieces taker
90 Injured but keeps playing; 91 Moderately injured, leaves field; 92 Badly injured, leaves field; 93 Injured and no replacement existed; 94 Injured after foul but continues; 95 Injured after foul and exits; 96 Injured after foul, no replacement existed; 97 Keeper injured, field player takes his place

### Goals (1xx). Pattern: home 100-143, away 150-190. Last digit: 0 free kick, 1 middle, 2 left wing, 3 right wing, 4 penalty
Home: 10x Reducing goal; 11x Equalizer; 12x Goal to take lead; 13x Increase goal; away: 15x Reducing; 16x Equalizer; 17x Take lead; 18x Increase.
SE goals: 105 unpredictable long pass; 106 unpredictable scores on his own; 107 long shot (no tactic); 108 unpredictable special action; 109 unpredictable mistake; 115 quick scores after rush; 116 quick rushes, passes and receiver scores; 117 tired defender mistake, striker scores; 118 corner to anyone; 119 corner, head specialist; 125 unpredictable own goal; 135 experienced forward scores; 136 inexperienced defender causes goal; 137 winger to head specialist scores; 138 winger to anyone scores; 139 technical goes around head player; 140-143 counter-attack goal (free kick, middle, left, right); 185 indirect free kick goal; 186 counter-attack indirect free kick goal; 187 long shot goal; 190 powerful normal forward generates extra chance (goal).

### Chances without goal (2xx), mirror of 1xx (+100): 
200-204, 210-214, 220-224, 230-234 home (No reducing / No equalizer / No goal to take lead / No increase goal; last digit as above); 250-254, 260-264, 270-274, 280-284 away; 
SE: 205 unpredictable long pass; 206 unpredictable almost scores; 207 long shot (no tactic); 208 unpredictable special action; 209 unpredictable mistake; 215 speedy misses after rush; 216 quick rushes but receiver fails; 217 tired defender mistake but no goal; 218 corner to anyone; 219 corner, head specialist; 225 unpredictable own goal almost; 235 experienced forward fails; 236 inexperienced defender almost causes goal; 237 winger to someone no goal; 239 technical goes around head player, no goal; 240-243 counter-attack no goal (free kick, middle, left, right); 285 no goal indirect free kick; 286 counter-attack no goal indirect free kick; 287 no goal long shot; 288 no goal long shot defended; 289 quick rushes stopped by quick defender; 290 powerful normal forward generates extra chance (no goal).

### Weather, tactics, changes
301 Technical suffers from rain; 302 Powerful thrives in rain; 303 Technical thrives in sun; 304 Powerful suffers from sun; 305 Quick loses in rain; 306 Quick loses in sun; 307 Support player boost succeeded; 308 boost failed and organization dropped; 309 boost failed; 310 Powerful defensive inner presses chance; 311 Counter attack triggered by technical defender
331 Pressing; 332 Counter-attacking; 333 Attack in middle; 334 Attack on wings; 335 Play creatively; 336 Long shots; 343 Attack in middle used; 344 Attack on wings used
350 Substitution team behind; 351 team ahead; 352 minute; 360 Change of tactic behind; 361 ahead; 362 minute; 370 Position swap behind; 371 ahead; 372 minute
380 Man marking success short distance; 381 long distance; 382 changed short to long; 383 long to short; 384 Man marker penalty no man marked on field; 385 marker changed short to long; 386 long to short; 387 penalty man marked not in marking position; 388 penalty man marker not in marking position; 389 penalty no man marked in opponent team
390 Rainy weather, many players affected; 391 Sunny weather, many players affected

### Injuries and extras
401 Knee left; 402 Knee right; 403 Thigh left; 404 Thigh right; 405 Foot left; 406 Foot right; 407 Ankle left; 408 Ankle right; 409 Calf left; 410 Calf right; 411 Groin left; 412 Groin right; 413 Collarbone; 414 Back; 415 Hand left; 416 Hand right; 417 Arm left; 418 Arm right; 419 Shoulder left; 420 Shoulder right; 421 Rib; 422 Head; 423 Injured by foul; 424 Injured player replaced; 425 No replacement for injured player; 426 Field player takes injured keeper's place; 427 Regainer bruised instead
450 Player got third yellow card, misses next match; 451 With this standing team x relegates to cup y; 452 Player's current team matches 100s anniversary; 453 Player possibly last game in this team; 454 Doctor report of injury length; 455 New star player of the team; 456 Career goals multiple of 50; 457 League goals this season; 458 Cup goals this season; 459 Bench player warming up; 460 Fans shocked by losing; 461 Fans upset by losing; 462 Fans surprised by winning; 463 Fans excited by winning; 464 Exact number of spectators
465 Team should win to secure league; 466 should win to have chance of league; 467 winner can have chance of league; 468 should win to not demote; 469 should win to have chance of not demoting; 470 Loser will demote
471 Home/away has most possession at start; 472 Equal possession at start; 473 Career-ending injury; 474 Team of youngsters; 475 Low attendance because of fan mood; 476 Extra security because of fan mood; 477 Both teams' fans angry; 478 Team has best cup run if win; 479 Both teams could have best cup run; 480 Current round is team's best cup run; 481 New formation today; 482 Same style of play; 483 Different styles of play; 484 One team's style of play; 485 Team of oldies; 486 Team is aggressive; 487 Only homegrown players; 488 All players from same country; 489 Comeback after long injury; 490 Previous cup match similar outcome; 491 different outcome; 492 Previous league match similar outcome; 493 different outcome; 494 Team has the ball but is not attacking; 495 Team has the ball and started attacking; 496 Team still in cup; 497 Both teams still in cup; 498 Team looks tired (low average stamina)
500 Both teams walkover; 501 Home walkover; 502 Away walkover; 503 Both teams break game (2 players left); 504 Home breaks game; 505 Away breaks game
510 Yellow card nasty play; 511 Yellow card cheating; 512 Red card (2nd warning) nasty play; 513 Red card (2nd warning) cheating; 514 Red card without warning
596 Extra time started (third half); 597 Second half started; 598 Match started; 599 Match finished
601 Congratulations to the winner; 602 Winner advances (no relegation cup for loser); 603 Winner advances and loser relegates to cup X; 604 Match ended in a tie; 605 End of match, team won the league; 606 End of match, team demotes directly
650 Hattrick anniversary; 651 Team anniversary
700 Event-o-Matic: manager taunts opponent; 701 praises opponent; 702 asks fans for support; 703 expects great show; 704 honours club legacy
800 Star player missed match (red card); 801 (injury); 802 Team on winning streak; 803 Both teams on winning streak; 804 Team will break winning streak; 805 Weakest team (HTRating) is winning; 806 Possession shift because of red card; 807 shift because of substitution (lost); 808 (gained); 809 shift other reason; 810 Previous match winner; 811 Previous match was a tie; 812 Player birthday; 813 New match kit; 814 Team underperforming vs last league match; 815 overperforming; 816 Possession shift because of team confusion; 817 because of team nerves; 818 Brothers play for same team; 819 Father/son in same team; 820 Family members play against each other; 821 Family members assist + goal; 822 Family members facing each other in a penalty
880 Assist end to a goal

## Consequences for the design (derived)
- Goal vs chance vs card vs info can be classified from the ID range; scoring context (reducing/equalizer/take lead/increase) is in the tens digit of goals, so the commentators know the dramatic weight of a goal without tracking score.
- 30-33 SubjectTeamId is total seats and ObjectPlayerId is sold seats (not a team: this explains "team 17417" on stadium events).
- 454 ObjectPlayerId is injury weeks. 61/64 carry organisation level, 75 carries added minutes, 40 carries midfield possession.
- Many events are context for the analyst (4xx, 8xx), not play-by-play: route them to the analyst/gap-filler, not the lead commentator.
