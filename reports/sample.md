# Cantera IQ: Stage 1 Sample

Age at 2022-11-20; 64 matches; 829 players; 0 missing birth dates.

Historical World Cup 2022 national-team data, not academy data or present-day ages.
Selection: ten age <=23 players with the most minutes, not a talent ranking.

Metric cells: per 90 (percentile). NA means insufficient evidence, not zero.

| Player | Age | Position | National team | Minutes | Peers | Shots | npxG | Key passes | Completed passes | Dribbles won | Tackles won | Evidence |
|---|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Joško Gvardiol | 20 | CB | Croatia | 754.5 | 9 | 0.24 (50) | 0.02 (38) | 0.12 (88) | 55.23 (88) | 0.24 (75) | 1.31 (62) | limited_sample |
| Aurélien Tchouaméni | 22 | DM | France | 700.9 | 8 | 0.77 (57) | 0.05 (71) | 0.77 (100) | 55.35 (71) | 0.26 (14) | 0.51 (0) | limited_sample |
| Kylian Mbappé | 23 | W | France | 690.5 | 18 | 3.78 (100) | 0.35 (94) | 1.17 (47) | 23.46 (47) | 3.91 (100) | 0.00 (3) | moderate_sample |
| Enzo Fernandez | 21 | DM | Argentina | 646.6 | 8 | 1.11 (86) | 0.04 (57) | 0.70 (86) | 57.91 (100) | 0.42 (57) | 1.81 (71) | limited_sample |
| Azzedine Ounahi | 22 | CM | Morocco | 614.2 | 2 | 0.88 (NA) | 0.04 (NA) | 0.88 (NA) | 32.38 (NA) | 1.47 (NA) | 0.73 (NA) | insufficient_peers |
| Alexis MacAllister | 23 | CM | Argentina | 603.3 | 2 | 1.04 (NA) | 0.07 (NA) | 1.04 (NA) | 36.10 (NA) | 0.75 (NA) | 1.04 (NA) | insufficient_peers |
| Julián Álvarez | 22 | ST | Argentina | 516.9 | 5 | 1.92 (75) | 0.33 (50) | 0.35 (75) | 16.19 (50) | 0.00 (0) | 0.70 (25) | limited_sample |
| Diogo Costa | 23 | GK | Portugal | 503.1 | 1 | 0.00 (NA) | 0.00 (NA) | 0.18 (NA) | 19.86 (NA) | 0.00 (NA) | 0.00 (NA) | insufficient_peers |
| Cody Gakpo | 23 | ST | Netherlands | 490.5 | 5 | 0.92 (0) | 0.10 (25) | 1.83 (100) | 17.98 (75) | 0.92 (50) | 0.92 (50) | limited_sample |
| Declan Rice | 23 | DM | England | 478.2 | 8 | 0.00 (0) | 0.00 (0) | 0.19 (14) | 57.59 (86) | 0.00 (0) | 0.75 (14) | limited_sample |

## Metric Definitions

All rates = total * 90 / total playing minutes.

- **shots**: Non-penalty shots: count of Shot events excluding penalties; shootouts excluded.
- **npxg**: Non-penalty expected goals: sum of StatsBomb shot probabilities, excluding penalties. Not goals scored or a Cantera model.
- **key_passes**: Shot-assist passes: Pass events with shot_assist=true, whether or not the shot becomes a goal.
- **completed_passes**: Completed passes: Pass events without an outcome field, including set pieces. Volume, not completion percentage.
- **successful_dribbles**: Successful take-ons: Dribble events with outcome Complete. Carries are not dribbles.
- **tackles_won**: Tackles won: Duel/Tackle events with Won, Success In Play or Success Out. Not interceptions or all defensive duels.

## Evidence And Comparisons

Percentiles require >= 180 minutes and >= 5 peers, including the player, in the same primary position and age band (U20, 20-23, 24-29, 30+).
Percentile = 100 * (number below + (number tied - 1) / 2) / (peer count - 1).
An all-tied group receives 50. Rates are rounded to 8 decimals only for identifying ties.
Primary position is the position group with most playing time; all player events enter their overall rates.
Minutes include stoppage and extra time, exclude breaks, shootouts and recorded temporary absences.
Evidence labels are heuristics, not calibrated probabilities or statistical confidence intervals.
A moderate sample requires 450 minutes and 10 peers; a smaller eligible sample is limited.
Higher volume does not necessarily mean better performance. Goalkeepers need specialist metrics later.
This tournament cannot establish academy potential, future development or first-team readiness.

## Sources

- Events, lineups and xG: [StatsBomb Open Data](https://github.com/statsbomb/open-data).
- Birth dates: [FIFA official 2022 squad list](https://fdp.fifa.org/assetspublic/ce44/pdf/SquadLists-English.pdf).
- Every source URL, retrieval time and SHA-256 is stored in DuckDB's sources table.
- Before external publication, comply with StatsBomb's terms and include their logo from the official media pack.
- Full methodology and limitations: [../docs/DATA-REFERENCE.md](../docs/DATA-REFERENCE.md).
