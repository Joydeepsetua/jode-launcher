import React, {memo, useEffect, useState} from 'react';
import {Image, StyleSheet, View} from 'react-native';
import {getAppIcon} from '../native/LauncherModule';
import type {AppInfo} from '../types/app';

type Props = {
  app: AppInfo;
  size: number;
};

/**
 * An app's own icon, as the system draws it.
 *
 * The space is held from the first frame whether or not the picture has
 * arrived, so names never shift sideways when their icons land.
 */
function AppIconComponent({app, size}: Props) {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    setUri(null);
    getAppIcon(app).then(next => {
      if (current) {
        setUri(next);
      }
    });
    return () => {
      current = false;
    };
  }, [app]);

  return (
    <View style={[styles.frame, {width: size, height: size}]}>
      {uri !== null ? (
        <Image
          source={{uri}}
          style={{width: size, height: size}}
          fadeDuration={0}
          accessibilityIgnoresInvertColors
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
  },
});

export const AppIcon = memo(
  AppIconComponent,
  (previous, next) =>
    previous.app.id === next.app.id && previous.size === next.size,
);
