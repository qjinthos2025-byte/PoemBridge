// Base de datos de poemas (por ahora local, con traducción al español).
// Para añadir más, copia un bloque y cambia los datos.
// Más adelante se podrá sustituir por una base de datos real (ver buscarPoemas en script.js).
var POEMAS = [
  {
    "titulo": "静夜思",
    "titulo_es": "Pensamiento en una noche tranquila",
    "autor": "李白",
    "autor_pinyin": "Li Bai",
    "dinastia": "Tang",
    "versos": [
      "床前明月光",
      "疑是地上霜",
      "举头望明月",
      "低头思故乡"
    ],
    "traduccion": [
      "Ante mi cama, la luz clara de la luna",
      "Creo que es escarcha sobre el suelo",
      "Levanto la cabeza y miro la luna brillante",
      "Bajo la cabeza y pienso en mi tierra natal"
    ],
    "nota": "Escrito lejos de casa: la luna une al viajero con su familia y su hogar."
  },
  {
    "titulo": "春晓",
    "titulo_es": "Alba de primavera",
    "autor": "孟浩然",
    "autor_pinyin": "Meng Haoran",
    "dinastia": "Tang",
    "versos": [
      "春眠不觉晓",
      "处处闻啼鸟",
      "夜来风雨声",
      "花落Final Fantasy VII Remake Intergrade知多少"
    ],
    "traduccion": [
      "En primavera se duerme sin notar el amanecer",
      "Por todas partes se oye el canto de los pájaros",
      "Anoche sonaron el viento y la lluvia",
      "¿Cuántas flores habrán caído?"
    ],
    "nota": "Una mañana tranquila de primavera, con una pizca de melancolía por las flores caídas."
  },
  {
    "titulo": "登鹳雀楼",
    "titulo_es": "Subiendo a la torre de la cigüeña",
    "autor": "王之涣",
    "autor_pinyin": "Wang Zhihuan",
    "dinastia": "Tang",
    "versos": [
      "白日依山尽",
      "黄河入海流",
      "欲穷千里目",
      "更上一层楼"
    ],
    "traduccion": [
      "El sol brillante se oculta tras las montañas",
      "El río Amarillo corre hacia el mar",
      "Para alcanzar con la vista mil li más lejos",
      "sube un piso más de la torre"
    ],
    "nota": "El último verso es casi un proverbio: para ver más lejos, hay que subir más alto."
  },
  {
    "titulo": "相思",
    "titulo_es": "Añoranza",
    "autor": "王维",
    "autor_pinyin": "Wang Wei",
    "dinastia": "Tang",
    "versos": [
      "红豆生南国",
      "春来发几枝",
      "愿君多采撷",
      "此物最相思"
    ],
    "traduccion": [
      "Las semillas rojas crecen en el sur",
      "Cuando llega la primavera, ¿cuántas ramas brotan?",
      "Ojalá recojas muchas",
      "Pues ellas son las que más hacen pensar en el ser querido"
    ],
    "nota": "Las «semillas rojas» (红豆) son un símbolo chino del amor y de la añoranza."
  },
  {
    "titulo": "悯农",
    "titulo_es": "Compasión por los campesinos",
    "autor": "李绅",
    "autor_pinyin": "Li Shen",
    "dinastia": "Tang",
    "versos": [
      "锄禾日当午",
      "汗滴禾下土",
      "谁知盘中餐",
      "粒粒皆辛苦"
    ],
    "traduccion": [
      "Azadonando los cultivos bajo el sol de mediodía",
      "El sudor gotea sobre la tierra al pie de las plantas",
      "¿Quién sabe que la comida que hay en el plato",
      "es, grano a grano, fruto de un duro trabajo?"
    ],
    "nota": "Poema muy conocido que se enseña a los niños en China para que valoren el esfuerzo de los campesinos y no desperdicien la comida."
  }
];
