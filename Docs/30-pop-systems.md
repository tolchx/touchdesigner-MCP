# 30 POP Systems — Parameter Experiments

## Row 0: Noise Variations (5 systems)
| # | Name | Chain | Key Params |
|---|------|-------|------------|
| 1 | pop_noise_heavy | sphere→noise→null | amp=0.8, period=3.0, seed=99 |
| 2 | pop_noise_fine | sphere→noise→null | amp=0.1, period=0.5, seed=42 |
| 3 | pop_noise_warp | sphere→noise→noise→null | n1 amp=0.6, n2 amp=0.3 |
| 4 | pop_noise_sparse | sphere→noise→null | type=sparse, amp=0.5 |
| 5 | pop_noise_alligator | sphere→noise→null | type=alligator, amp=0.4 |

## Row 1: Math Transforms (5 systems)
| # | Name | Chain | Key Params |
|---|------|-------|------------|
| 6 | pop_math_scale2x | sphere→math→null | mult=2.0 |
| 7 | pop_math_scale05 | sphere→math→null | mult=0.5 |
| 8 | pop_math_offset | sphere→math→null | mult=1.0, postadd=1.5 |
| 9 | pop_math_negate | sphere→math→null | mult=-1.0 (mirror) |
| 10 | pop_math_stretch | sphere→math→null | mult=3.0, postadd=-1.5 |

## Row 2: Copy Variations (5 systems)
| # | Name | Chain | Key Params |
|---|------|-------|------------|
| 11 | pop_copy_line | sphere→copy→null | ncy=10, ty=0.5 |
| 12 | pop_copy_grid | grid→copy→null | ncy=5, ty=1.5, sx=0.8 |
| 13 | pop_copy_spiral | sphere→copy→null | ncy=20, ty=0.3, sx=0.95, rz=18° |
| 14 | pop_copy_tower | sphere→copy→null | ncy=15, ty=0.4, sx=0.9 |
| 15 | pop_copy_wave | sphere→noise→copy→null | noise amp=0.4, copy ncy=8 |

## Row 3: Limit + Delete (3 systems)
| # | Name | Chain | Key Params |
|---|------|-------|------------|
| 16 | pop_limit_box | sphere→copy→limit→null | min=-0.5, max=0.5 |
| 17 | pop_limit_floor | sphere→noise→limit→null | min=-0.3 (floor) |
| 18 | pop_limit_sphere | sphere→copy→limit→null | min=-0.8, max=0.8 |

## Row 4: Attribute (2 systems)
| # | Name | Chain | Key Params |
|---|------|-------|------------|
| 19 | pop_attr_color | sphere→attr→math→null | custom attr pointsize=0.1, math mult=5 |
| 20 | pop_attr_scale | grid→attr→copy→null | custom attr psize=0.2, copy ncy=3 |

## Row 5: Feedback + Cache (3 systems)
| # | Name | Chain | Key Params |
|---|------|-------|------------|
| 21 | pop_fb_basic | sphere→fb→null | preroll=2, inputmul=2 |
| 22 | pop_fb_noise | sphere→noise→fb→null | noise amp=0.5 |
| 23 | pop_cache_playback | sphere→noise→cache→null | cache=64 frames |

## Row 6: Blend (2 systems)
| # | Name | Chain | Key Params |
|---|------|-------|------------|
| 24 | pop_blend_add | sphere→copy→blend→null | blend=add, weight=0.5 |
| 25 | pop_blend_max | sphere→copy→blend→null | blend=max, weight=0.8 |

## Row 7: Multi-operator (5 systems)
| # | Name | Chain | Key Params |
|---|------|-------|------------|
| 26 | pop_multi_deform | sphere→noise→math→limit→null | noise amp=0.5, math mult=1.5 |
| 27 | pop_multi_instancing | grid→attr→copy→blend→null | attr custom, blend=add |
| 28 | pop_multi_wave | grid→noise→copy→limit→null | 5-op chain |
| 29 | pop_multi_feedback | sphere→noise→fb→cache→null | cache=128 frames |
| 30 | pop_multi_complex | grid→noise→attr→math→copy→blend→limit→null | 8-op mega chain |

**Result: 30/30 OK, 0 errors, all verified against live TD build 2025.32460**
