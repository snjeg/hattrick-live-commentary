import type { Mood, Speaker } from '../model/voice';

/**
 * Line templates. Placeholders: {team} {opponent} {player} {scoreline} {minute} {situation}
 * {homeTeam} {awayTeam}. A template whose placeholders cannot all be filled is skipped, so the
 * writer degrades gracefully when a name or detail is unknown.
 */
export type Topic =
  | 'kickoff'
  | 'halfTime'
  | 'fullTime'
  | 'goal'
  | 'goal.reducing'
  | 'goal.equalizer'
  | 'goal.lead'
  | 'goal.increase'
  | 'miss'
  | 'card.yellow'
  | 'card.red'
  | 'injury';

export interface Template {
  id: string;
  topic: Topic;
  speaker: Speaker;
  text: string;
  mood: Mood;
  intensity: number;
}

type Row = [text: string, mood: Mood, intensity: number];

function group(topic: Topic, speaker: Speaker, rows: Row[]): Template[] {
  return rows.map(([text, mood, intensity], i) => ({
    id: `${topic}.${speaker}.${i + 1}`,
    topic,
    speaker,
    text,
    mood,
    intensity,
  }));
}

export const TEMPLATES: readonly Template[] = [
  // Kick-off
  ...group('kickoff', 'lead', [
    ["And we're under way! {homeTeam} against {awayTeam}.", 'anticipation', 0.7],
    ['The referee blows, and {homeTeam} and {awayTeam} get us started.', 'anticipation', 0.6],
    ["Kick-off! Let's see what {homeTeam} and {awayTeam} have for us today.", 'excited', 0.6],
  ]),
  ...group('kickoff', 'analyst', [
    ['The first few minutes will tell us a lot about how both sides want to play.', 'calm', 0.4],
    [
      'Early on, watch who wins the midfield. That usually decides the shape of the game.',
      'calm',
      0.4,
    ],
    ['Plenty to play for. Neither side will want to give anything away early.', 'neutral', 0.4],
  ]),

  // Half time
  ...group('halfTime', 'lead', [
    ["That's half time. {scoreline}.", 'neutral', 0.5],
    ['The referee calls a halt to the first half. {scoreline}.', 'neutral', 0.5],
    ['Half time, then, with the score {scoreline}.', 'calm', 0.4],
  ]),
  ...group('halfTime', 'analyst', [
    ['Fifteen minutes for the managers to rethink things. Expect some changes.', 'calm', 0.4],
    ['A lot to talk about in the dressing rooms, I suspect.', 'calm', 0.4],
    ['The second half could look very different if either side adjusts its shape.', 'neutral', 0.4],
  ]),

  // Full time
  ...group('fullTime', 'lead', [
    ["It's all over! {scoreline}.", 'celebratory', 0.8],
    ['The final whistle goes. {scoreline}.', 'neutral', 0.7],
    ["And that's the end of the match. {scoreline}.", 'neutral', 0.6],
  ]),
  ...group('fullTime', 'analyst', [
    ['A result that will shape the week for both clubs.', 'calm', 0.4],
    ['Both managers will have plenty to think about after that one.', 'calm', 0.4],
    ["We'll be talking about this match for a while.", 'neutral', 0.5],
  ]),

  // Goals: the lead's call
  ...group('goal', 'lead', [
    ['GOAL! {player} scores for {team}!', 'excited', 1],
    ["It's in! {team} score, and it's {player}!", 'celebratory', 1],
    ['{player} finds the net for {team}!', 'excited', 0.95],
  ]),
  ...group('goal.equalizer', 'lead', [
    ['{team} are level! {scoreline}!', 'excited', 1],
    ["It's all square! {team} equalise! {scoreline}.", 'celebratory', 1],
    ['The equaliser for {team}! {scoreline}!', 'excited', 1],
  ]),
  ...group('goal.lead', 'lead', [
    ['{team} take the lead! {scoreline}!', 'excited', 1],
    ['{team} are in front! {scoreline}.', 'celebratory', 1],
    ['And {team} go ahead! {scoreline}!', 'excited', 1],
  ]),
  ...group('goal.increase', 'lead', [
    ['{team} extend their lead! {scoreline}.', 'celebratory', 0.9],
    ['Another one for {team}! {scoreline}.', 'excited', 0.9],
    ['{team} add to their lead! {scoreline}.', 'celebratory', 0.85],
  ]),
  ...group('goal.reducing', 'lead', [
    ['{team} pull one back! {scoreline}.', 'excited', 0.9],
    ['A goal back for {team}! {scoreline}.', 'excited', 0.85],
    ["{team} aren't done yet! {scoreline}.", 'excited', 0.9],
  ]),
  // Goals: the analyst explains how
  ...group('goal', 'analyst', [
    ['That came {situation}. {team} found the space they were looking for.', 'neutral', 0.6],
    ['Look at how that one came {situation}. {opponent} never got close enough.', 'neutral', 0.6],
    ['{opponent} will be disappointed with the defending there.', 'calm', 0.5],
    ['{player} made no mistake there, in the {minute}.', 'neutral', 0.6],
  ]),

  // Missed chances
  ...group('miss', 'lead', [
    ['So close for {team}!', 'tense', 0.8],
    ['{player} goes close, but no goal!', 'tense', 0.8],
    ["Chance for {team}... and it's gone begging.", 'disappointed', 0.6],
  ]),
  ...group('miss', 'analyst', [
    ["{team} are getting joy {situation}. They'll feel a goal is coming.", 'neutral', 0.5],
    ['{opponent} got away with one there.', 'neutral', 0.5],
    ['That should be a warning sign for {opponent}.', 'calm', 0.5],
    ['Good work to create that, even if the finish was missing.', 'calm', 0.4],
  ]),

  // Cards
  ...group('card.yellow', 'lead', [
    ['Yellow card for {player} of {team}.', 'tense', 0.6],
    ['{player} goes into the book.', 'tense', 0.5],
    ["The referee shows a yellow to {team}'s {player}.", 'tense', 0.55],
  ]),
  ...group('card.yellow', 'analyst', [
    ['{player} will have to be careful now for the rest of the match.', 'calm', 0.4],
    ["That's a booking that could matter later on.", 'calm', 0.4],
    ['{team} need to keep their discipline here.', 'calm', 0.4],
  ]),
  ...group('card.red', 'lead', [
    ['Red card! {player} is sent off!', 'tense', 0.9],
    ['{team} are down to ten! {player} has to go!', 'tense', 0.9],
    ['{player} is dismissed, and {team} are a player short.', 'tense', 0.85],
  ]),
  ...group('card.red', 'analyst', [
    ['That changes everything. {team} will have to reorganise.', 'concerned', 0.6],
    ['A big moment. {opponent} have to make the extra man count now.', 'neutral', 0.6],
    ['Playing with ten for the rest of the match is a huge ask for {team}.', 'concerned', 0.6],
  ]),

  // Injuries
  ...group('injury', 'lead', [
    ['{player} is down and needs treatment.', 'concerned', 0.5],
    ['A worry for {team}: {player} is hurt.', 'concerned', 0.5],
    ['Play stops while {player} gets attention.', 'concerned', 0.45],
  ]),
  ...group('injury', 'analyst', [
    ["Nobody wants to see that. Let's hope it's nothing serious.", 'concerned', 0.4],
    ['{team} may have to rethink things if that injury is serious.', 'concerned', 0.4],
    ['Injuries can turn a match. {team} will be anxious about this one.', 'concerned', 0.4],
  ]),
];

export function templatesFor(topic: Topic, speaker: Speaker): Template[] {
  return TEMPLATES.filter((t) => t.topic === topic && t.speaker === speaker);
}
