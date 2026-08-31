/**
 * First run is the one flow a user cannot re-enter to try again, so the order
 * of its pages and the conditions that skip them are pinned down here.
 */
import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 24, bottom: 12, left: 0, right: 0}),
}));

jest.mock('../src/native/LauncherModule', () => ({
  hasUsageAccess: jest.fn(() => false),
  isDefaultLauncher: jest.fn(() => false),
  requestUsageAccess: jest.fn(),
  requestDefaultLauncher: jest.fn(),
}));

import {
  hasUsageAccess,
  isDefaultLauncher,
} from '../src/native/LauncherModule';
import {WelcomeScreen} from '../src/screens/WelcomeScreen';

const mockUsage = hasUsageAccess as jest.Mock;
const mockDefault = isDefaultLauncher as jest.Mock;

/** Every string the screen currently renders, flattened. */
function collect(node: unknown): string[] {
  if (typeof node === 'string') {
    return [node];
  }
  if (Array.isArray(node)) {
    return node.flatMap(collect);
  }
  if (node !== null && typeof node === 'object' && 'children' in node) {
    return collect((node as {children: unknown}).children);
  }
  return [];
}

function textOf(tree: TestRenderer.ReactTestRenderer): string {
  return collect(tree.toJSON()).join(' ');
}

/** Presses the control carrying the given label. */
function press(tree: TestRenderer.ReactTestRenderer, label: string): void {
  const labelled = tree.root.findAll(node => node.children.includes(label));
  const node = labelled[labelled.length - 1];
  if (node === undefined) {
    throw new Error(`no control labelled "${label}" in: ${textOf(tree)}`);
  }
  let owner = node.parent;
  while (owner !== null && typeof owner.props.onPress !== 'function') {
    owner = owner.parent;
  }
  if (owner === null) {
    throw new Error(`"${label}" is not inside anything pressable`);
  }
  act(() => owner!.props.onPress());
}

function render(onDone = jest.fn()) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<WelcomeScreen onDone={onDone} />);
  });
  return {tree, onDone};
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUsage.mockReturnValue(false);
  mockDefault.mockReturnValue(false);
});

describe('with nothing granted', () => {
  it('opens on the introduction', () => {
    const {tree} = render();
    expect(textOf(tree)).toContain('JODE');
    expect(textOf(tree)).toContain('Get started');
  });

  it('walks introduction → usage access → home role → done', () => {
    const {tree, onDone} = render();

    press(tree, 'Get started');
    expect(textOf(tree)).toContain('1 of 2');
    expect(textOf(tree)).toContain('Usage access');

    press(tree, 'Not now');
    expect(textOf(tree)).toContain('2 of 2');
    expect(textOf(tree)).toContain('Make it home');
    expect(onDone).not.toHaveBeenCalled();

    press(tree, 'Not now');
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('a doubled press', () => {
  it('dismisses one request, not two', () => {
    const {tree, onDone} = render();
    press(tree, 'Get started');

    // Whatever fires the skip twice — a bounced tap, an effect running again —
    // must not cost the user the page behind it.
    const skip = tree.root.findAll(
      node => node.props.accessibilityLabel === 'Skip',
    )[0];
    act(() => {
      skip.props.onPress();
      skip.props.onPress();
    });

    expect(textOf(tree)).toContain('2 of 2');
    expect(textOf(tree)).toContain('Make it home');
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe('with usage access already granted', () => {
  it('passes over the page that has nothing left to ask', () => {
    mockUsage.mockReturnValue(true);
    const {tree} = render();

    press(tree, 'Get started');
    expect(textOf(tree)).not.toContain('Usage access');
    expect(textOf(tree)).toContain('Make it home');
  });
});
