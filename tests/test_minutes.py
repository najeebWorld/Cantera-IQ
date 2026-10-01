import unittest

from cantera.minutes import playing_stints


def event(index, kind, period=1, timestamp="00:00:00.000", **fields):
    return dict(index=index, type={"name": kind}, period=period,
                timestamp=timestamp, team={"id": 1}, **fields)


def starting():
    return event(1, "Starting XI", tactics={"lineup": [
        {"player": {"id": 10}, "position": {"id": 23}},
        {"player": {"id": 20}, "position": {"id": 4}},
    ]})


class MinutesTests(unittest.TestCase):
    def test_halftime_substitution_includes_stoppage_not_break(self):
        events = [starting(), event(2, "Half End", timestamp="00:48:00.000"),
                  event(3, "Substitution", period=2, player={"id": 10},
                        substitution={"replacement": {"id": 30}}),
                  event(4, "Half End", period=2, timestamp="00:50:00.000"),
                  event(5, "Shot", period=5, timestamp="00:10:00.000")]
        stints, duration = playing_stints(events)
        minutes = {stint.player_id: (stint.end_seconds - stint.start_seconds) / 60
                   for stint in stints}
        self.assertEqual(duration, 98 * 60)
        self.assertEqual(minutes, {10: 48, 20: 98, 30: 50})

    def test_temporary_exit_red_card_and_extra_time(self):
        events = [starting(), event(2, "Player Off", timestamp="00:10:00.000", player={"id": 10}),
                  event(3, "Player On", timestamp="00:11:00.000", player={"id": 10}),
                  event(4, "Half End", timestamp="00:46:00.000"),
                  event(5, "Foul Committed", period=2, timestamp="00:15:00.000",
                        player={"id": 20}, foul_committed={"card": {"name": "Second Yellow"}}),
                  event(6, "Half End", period=2, timestamp="00:48:00.000"),
                  event(7, "Half End", period=3, timestamp="00:16:00.000"),
                  event(8, "Half End", period=4, timestamp="00:17:00.000")]
        stints, duration = playing_stints(events)
        totals = {identifier: sum(stint.end_seconds - stint.start_seconds for stint in stints
                                  if stint.player_id == identifier) / 60 for identifier in (10, 20)}
        self.assertEqual(duration, 127 * 60)
        self.assertEqual(totals, {10: 126, 20: 61})

    def test_missing_period_end_is_not_guessed(self):
        with self.assertRaisesRegex(ValueError, "Missing Half End"):
            playing_stints([starting()])

    def test_tactical_shift_splits_position_without_double_minutes(self):
        events = [starting(), event(2, "Tactical Shift", timestamp="00:20:00.000",
                  tactics={"lineup": [{"player": {"id": 10}, "position": {"id": 21}}]}),
                  event(3, "Half End", timestamp="00:45:00.000")]
        stints, _ = playing_stints(events)
        self.assertEqual([(stint.position, (stint.end_seconds - stint.start_seconds) / 60)
                          for stint in stints if stint.player_id == 10], [("ST", 20), ("W", 25)])