---
version: alpha
name: FloorWalk
description: Visual system for the FloorWalk store inspection workspace.
colors:
  background: '#f9fbfc'
  foreground: '#131416'
  card: '#ffffff'
  card-foreground: '#131416'
  primary: '#131416'
  primary-foreground: '#ffffff'
  secondary: '#f4f6f8'
  secondary-foreground: '#131416'
  muted: '#f4f6f8'
  muted-foreground: '#5d5f60'
  accent: '#1b6c80'
  accent-foreground: '#ffffff'
  destructive: '#c4242a'
  success: '#1e7b4f'
  warning: '#92400e'
  border: '#e8eaec'
  input: '#cdced1'
  ring: '#1b6c80'
  ground: '#f9fbfc'
  surface: '#ffffff'
  raised: '#f4f6f8'
  active: '#ebedee'
  rule: '#f0f1f2'
  positive-background: '#dcfae5'
  positive-foreground: '#04250e'
  negative-background: '#ffedea'
  negative-foreground: '#831c1e'
  warning-background: '#fffbeb'
  warning-foreground: '#92400e'
  neutral-background: '#ebedee'
  neutral-foreground: '#353736'
  chart-1: '#1b6c80'
  chart-2: '#2f70bb'
  chart-3: '#a86f0c'
typography:
  sans:
    fontFamily: IBM Plex Sans
  mono:
    fontFamily: IBM Plex Mono
  page-title:
    fontFamily: IBM Plex Sans
    fontSize: 22px
    fontWeight: 600
  section-title:
    fontFamily: IBM Plex Sans
    fontSize: 16px
    fontWeight: 600
  body:
    fontFamily: IBM Plex Sans
    fontSize: 14px
  label:
    fontFamily: IBM Plex Sans
    fontSize: 12px
rounded:
  control: 6px
  card: 8px
  sheet: 16px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
components:
  app-frame:
    backgroundColor: '{colors.ground}'
    textColor: '{colors.foreground}'
  work-sheet:
    backgroundColor: '{colors.card}'
    textColor: '{colors.card-foreground}'
    rounded: '{rounded.sheet}'
  primary-action:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primary-foreground}'
  accent-state:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.accent-foreground}'
  secondary-control:
    backgroundColor: '{colors.secondary}'
    textColor: '{colors.secondary-foreground}'
  muted-control:
    backgroundColor: '{colors.muted}'
    textColor: '{colors.muted-foreground}'
  destructive-action:
    backgroundColor: '{colors.destructive}'
    textColor: '{colors.primary-foreground}'
  success-label:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.success}'
  warning-label:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.warning}'
  input-edge:
    backgroundColor: '{colors.input}'
  sheet-edge:
    backgroundColor: '{colors.border}'
  focus-indicator:
    backgroundColor: '{colors.ring}'
  frame-ground:
    backgroundColor: '{colors.background}'
  raised-row:
    backgroundColor: '{colors.raised}'
    textColor: '{colors.foreground}'
  active-item:
    backgroundColor: '{colors.active}'
    textColor: '{colors.foreground}'
  divider:
    backgroundColor: '{colors.rule}'
  status-positive:
    backgroundColor: '{colors.positive-background}'
    textColor: '{colors.positive-foreground}'
  status-negative:
    backgroundColor: '{colors.negative-background}'
    textColor: '{colors.negative-foreground}'
  status-warning:
    backgroundColor: '{colors.warning-background}'
    textColor: '{colors.warning-foreground}'
  status-neutral:
    backgroundColor: '{colors.neutral-background}'
    textColor: '{colors.neutral-foreground}'
  chart-series-primary:
    backgroundColor: '{colors.chart-1}'
  chart-series-secondary:
    backgroundColor: '{colors.chart-2}'
  chart-series-tertiary:
    backgroundColor: '{colors.chart-3}'
---

## Overview

FloorWalk supports chain-store inspection: staff submit on-site checklists, supervisors review them, and headquarters compares store completion and scores. Framed sheet keeps that work inside a quiet enterprise workspace.

## Colors

The workspace ground frames a white sheet. Use ink for the primary action and reserve teal for active navigation, selected states, and data emphasis.

## Themes

The interface remains light. Preserve these dark values in the shared token source for a later explicitly scoped theme implementation.

| Token      | Dark value |
| ---------- | ---------- |
| background | `#0a0a0a`  |
| foreground | `#fafafa`  |
| card       | `#171717`  |
| primary    | `#fff5f5`  |
| accent     | `#2dd4bf`  |
| border     | `#2e2e2e`  |
| input      | `#2e2e2e`  |
| ring       | `#737373`  |

## Typography

IBM Plex Sans carries interface copy; IBM Plex Mono is limited to IDs and keys.

## Layout

Use a 4px spacing grid. Keep the 228px sidebar and 48px top bar on the tinted frame; inset the white work sheet by 8px and pad its content by 24px. Data rows use a 48px pitch.

## Elevation & Depth

The sheet has a 1px edge and no shadow. Separate the work surface from the frame with the ground and surface colors.

## Shapes

Use 6px controls, 8px cards, and 16px sheets.
