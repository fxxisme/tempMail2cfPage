// 邮箱随机名生成的词库
// left: 前缀词  middle: 中间词  right: 后缀词
// 三者随机组合 + 3位数字后缀，可产生大量不重复的邮箱名

export const LEFT_WORDS = [
  // 颜色/材质
  'silver', 'golden', 'azure', 'cobalt', 'crimson', 'ivory', 'velvet', 'amber',
  'scarlet', 'violet', 'indigo', 'cerulean', 'copper', 'bronze', 'platinum', 'obsidian',
  'jade', 'coral', 'pearl', 'ruby', 'sapphire', 'emerald', 'topaz', 'opal',
  'carmine', 'cerise', 'teal', 'cyan', 'mauve', 'taupe', 'slate', 'ochre',
  // 天气/氛围
  'quiet', 'misty', 'frosty', 'dusky', 'sunny', 'rosy', 'warm', 'cool',
  'stormy', 'hazy', 'windy', 'rainy', 'snowy', 'balmy', 'crisp', 'breezy',
  'muggy', 'murky', 'starry', 'cloudy', 'foggy', 'gloomy', 'radiant', 'blazing',
  // 方向/位置
  'north', 'south', 'east', 'west', 'upper', 'lower', 'inner', 'outer',
  'center', 'forest', 'urban', 'rustic', 'coastal', 'alpine', 'polar', 'tropical',
  // 速度/力量
  'swift', 'rapid', 'turbo', 'hyper', 'sharp', 'solid', 'mighty', 'fierce',
  'bold', 'keen', 'brisk', 'fleet', 'nimble', 'stout', 'sturdy', 'robust',
  // 大小/程度
  'micro', 'mini', 'mega', 'ultra', 'super', 'grand', 'prime', 'epic',
  'vast', 'huge', 'tiny', 'lite', 'max', 'neo', 'proto', 'meta',
  // 品质/性格
  'noble', 'royal', 'smart', 'clever', 'brave', 'calm', 'gentle', 'mellow',
  'silent', 'hidden', 'secret', 'lucky', 'happy', 'jolly', 'merry', 'fancy',
  'proud', 'pure', 'rare', 'wise', 'free', 'true', 'just', 'fair',
  'bold', 'keen', 'vivid', 'classic', 'modern', 'retro', 'vintage', 'novel',
  // 科技/数字
  'pixel', 'cyber', 'digital', 'binary', 'quantum', 'neon', 'logic', 'data',
  'metro', 'daily', 'global', 'local', 'social', 'solar', 'lunar', 'cosmic',
  'astro', 'flux', 'core', 'arc', 'nova', 'zen', 'apex', 'proxy',
  // 其他
  'placid', 'serene', 'tranquil', 'docile', 'eager', 'agile', 'wily', 'zany',
  'chill', 'deep', 'wide', 'high', 'long', 'fast', 'safe', 'clean',
]

export const MIDDLE_WORDS = [
  // 自然/地理
  'river', 'meadow', 'forest', 'mount', 'valley', 'ocean', 'harbor', 'canyon',
  'summit', 'ridge', 'cliff', 'gorge', 'delta', 'basin', 'plateau', 'tundra',
  'prairie', 'marsh', 'lagoon', 'fjord', 'strait', 'atoll', 'bayou', 'dune',
  'oasis', 'crater', 'reef', 'cove', 'peninsula', 'isle', 'steppe', 'mesa',
  // 天文
  'cloud', 'comet', 'nebula', 'planet', 'galaxy', 'meteor', 'aurora', 'photon',
  'asteroid', 'pulsar', 'quasar', 'stellar', 'eclipse', 'zenith', 'nadir', 'cosmos',
  'orbit', 'relay', 'signal', 'horizon', 'eclipse', 'solstice', 'equinox', 'vortex',
  // 植物
  'maple', 'cedar', 'willow', 'birch', 'aspen', 'juniper', 'laurel', 'ivy',
  'cypress', 'elm', 'hazel', 'rowan', 'holly', 'sage', 'thyme', 'flax',
  'reeds', 'clover', 'iris', 'lotus', 'chia', 'aloe', 'yew', 'linden',
  // 鸟类
  'falcon', 'eagle', 'heron', 'sparrow', 'raven', 'robin', 'swallow', 'wren',
  'hawk', 'osprey', 'crane', 'stork', 'finch', 'lark', 'owl', 'dove',
  'pigeon', 'robin', 'swift', 'oriole', 'kinglet', 'warbler', 'starling', 'jay',
  // 动物(非鸟)
  'lynx', 'fox', 'wolf', 'deer', 'hare', 'otter', 'puma', 'bear',
  'moose', 'bison', 'cobra', 'viper', 'pony', 'colt', 'fawn', 'cub',
  // 宝石/材料
  'paper', 'stone', 'onyx', 'opal', 'ruby', 'topaz', 'pearl', 'coral',
  'marble', 'flint', 'quartz', 'garnet', 'agate', 'obsidian', 'ivory', 'amber',
  'brass', 'copper', 'tin', 'zinc', 'nickel', 'chrome', 'steel', 'iron',
  // 物理/数学
  'echo', 'alpha', 'sigma', 'omega', 'theta', 'zeta', 'kappa', 'gamma',
  'cipher', 'matrix', 'vector', 'beacon', 'compass', 'anchor', 'helix', 'prism',
  'vertex', 'tensor', 'scalar', 'fractal', 'polygon', 'entropy', 'fusion', 'fission',
  // 科技/工具
  'relay', 'beacon', 'lantern', 'compass', 'anchor', 'helix', 'circuit', 'node',
  'spark', 'ember', 'canvas', 'velvet', 'tapestry', 'mosaic', 'patch', 'stitch',
  'wire', 'bolt', 'gear', 'lever', 'pulley', 'wedge', 'screw', 'hinge',
  // 自然现象
  'tide', 'wave', 'bolt', 'storm', 'blaze', 'frost', 'gale', 'mist',
  'thunder', 'lightning', 'breeze', 'surge', 'drift', 'swirl', 'shimmer', 'glimmer',
]

export const RIGHT_WORDS = [
  // 建筑/空间
  'lake', 'box', 'desk', 'note', 'lane', 'mail', 'room', 'post',
  'hub', 'lab', 'den', 'bay', 'dock', 'port', 'gate', 'yard',
  'hall', 'cell', 'base', 'camp', 'fort', 'tower', 'vault', 'arch',
  'bridge', 'tunnel', 'dome', 'nave', 'atrium', 'porch', 'patio', 'terrace',
  // 数据/网络
  'core', 'node', 'link', 'ring', 'loop', 'beam', 'port', 'cell',
  'grid', 'mesh', 'cache', 'stack', 'queue', 'pipe', 'slot', 'bank',
  'list', 'tree', 'path', 'slot', 'pair', 'rank', 'tier', 'zone',
  // 动态/运动
  'wave', 'flux', 'flow', 'rush', 'glide', 'drift', 'leap', 'dash',
  'sprint', 'vault', 'soar', 'glide', 'bounce', 'spin', 'dart', 'bolt',
  'surge', 'pulse', 'thrust', 'shift', 'bend', 'curve', 'wave', 'shake',
  // 地形/景观
  'crest', 'ridge', 'peak', 'vale', 'grove', 'glade', 'brook', 'spring',
  'shore', 'reef', 'cape', 'hill', 'wood', 'fell', 'crag', 'scar',
  'bluff', 'cliff', 'dell', 'glen', 'hollow', 'cove', 'lagg', 'machair',
  // 天体/时间
  'star', 'moon', 'dawn', 'dusk', 'noon', 'morn', 'eve', 'night',
  'sol', 'sky', 'void', 'deep', 'vast', 'far', 'astral', 'zenith',
  'epoch', 'era', 'age', 'tick', 'pulse', 'span', 'term', 'cycle',
  // 音乐
  'tone', 'tune', 'beat', 'chord', 'harp', 'bell', 'drum', 'horn',
  'lyre', 'lute', 'flute', 'pipe', 'fife', 'reel', 'riff', 'motif',
  'note', 'clef', 'key', 'mode', 'pitch', 'tempo', 'rhythm', 'melody',
  // 植物
  'leaf', 'fern', 'moss', 'vine', 'root', 'seed', 'bud', 'bloom',
  'stalk', 'petal', 'thorn', 'bark', 'pith', 'sap', 'sprig', 'shoot',
  // 其他具象
  'mark', 'sign', 'flag', 'seal', 'brand', 'stamp', 'crest', 'shield',
  'spire', 'obelisk', 'monolith', 'totem', 'pylon', 'mast', 'loom', 'kiln',
]
