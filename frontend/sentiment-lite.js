/**
 * SentimentLite - A lightweight, browser-friendly sentiment analyzer
 * Based on the AFINN-165 wordlist approach
 */
export class SentimentLite {
    constructor() {
        // A subset of AFINN-165 words common in customer service/banking contexts
        this.afinn = {
            // Negative (-5 to -1)
            'abandon': -2, 'abandoned': -2, 'abuse': -3, 'abusive': -3, 'accuse': -2, 'accused': -2,
            'ache': -2, 'aching': -2, 'annoy': -2, 'annoyance': -2, 'annoyed': -2, 'annoying': -2,
            'apologise': -1, 'apologised': -1, 'apologize': -1, 'apologized': -1, 'apology': -1,
            'argued': -2, 'arguing': -2, 'argument': -2, 'arrogant': -2, 'ashamed': -2, 'asshole': -4,
            'awful': -3, 'bad': -3, 'badly': -3, 'banned': -2, 'barrier': -2, 'bastard': -5, 'battled': -1,
            'battling': -1, 'beaten': -2, 'bereaved': -2, 'bereavement': -2, 'bitch': -5, 'bizarre': -2,
            'blame': -2, 'blamed': -2, 'blocked': -2, 'blocking': -2, 'bloody': -3, 'bored': -2,
            'boring': -3, 'bother': -2, 'bothered': -2, 'broken': -1, 'bullshit': -4, 'bullying': -2,
            'burden': -2, 'cancel': -1, 'cancelled': -1, 'cancelling': -1, 'careless': -2, 'casualty': -2,
            'charged': -3, 'charges': -2, 'cheated': -3, 'cheater': -3, 'cheating': -3, 'clueless': -2,
            'cock': -5, 'collapsed': -2, 'collapsing': -2, 'collision': -2, 'combative': -2, 'complain': -2,
            'complained': -2, 'complaining': -2, 'complaint': -2, 'complaints': -2, 'concerned': -2,
            'confused': -2, 'confusing': -2, 'confusion': -2, 'conspiracy': -3, 'controversial': -2,
            'costly': -2, 'crazy': -2, 'cried': -2, 'cries': -2, 'crime': -3, 'criminal': -3,
            'crisis': -3, 'critic': -2, 'criticise': -2, 'criticised': -2, 'criticism': -2, 'cruel': -3,
            'crushed': -2, 'crying': -2, 'cunt': -5, 'damage': -3, 'damaged': -3, 'damages': -3,
            'damaging': -3, 'damn': -4, 'damned': -4, 'danger': -2, 'dangerous': -2, 'dead': -3,
            'deceive': -3, 'deceived': -3, 'deceives': -3, 'deceiving': -3, 'defect': -3, 'defects': -3,
            'deferred': -1, 'deficit': -2, 'degrade': -2, 'degraded': -2, 'degrades': -2, 'dehumanize': -2,
            'delay': -1, 'delayed': -1, 'delays': -1, 'denied': -2, 'denier': -2, 'deniers': -2,
            'denies': -2, 'deny': -2, 'denying': -2, 'depressed': -2, 'depressing': -2, 'derail': -2,
            'destroy': -3, 'destroyed': -3, 'destroying': -3, 'destroys': -3, 'destruction': -3,
            'destructive': -3, 'detached': -1, 'detain': -2, 'detained': -2, 'detention': -2,
            'devastating': -2, 'devastation': -2, 'dick': -4, 'difficult': -1, 'dilemma': -1,
            'disappoint': -2, 'disappointed': -2, 'disappointing': -2, 'disappointment': -2,
            'disaster': -2, 'disastrous': -3, 'disbelieve': -2, 'discard': -1, 'discarded': -1,
            'disconnect': -2, 'disconnected': -2, 'discontented': -2, 'discord': -2, 'discouraged': -2,
            'discredited': -2, 'disgust': -3, 'disgusted': -3, 'disgusting': -3, 'dishonest': -2,
            'disillusioned': -2, 'dislike': -2, 'disliked': -2, 'dislikes': -2, 'dismal': -2,
            'dismayed': -2, 'disorder': -2, 'disorganized': -2, 'disoriented': -2, 'disparage': -2,
            'displeased': -2, 'dispute': -2, 'disputed': -2, 'disputes': -2, 'disputing': -2,
            'disqualified': -2, 'disquiet': -2, 'disregard': -2, 'disregarded': -2, 'disrespect': -2,
            'disrespected': -2, 'disruption': -2, 'disruptions': -2, 'disruptive': -2, 'dissatisfied': -2,
            'distort': -2, 'distorted': -2, 'distorting': -2, 'distorts': -2, 'distress': -2,
            'distressed': -2, 'disturb': -2, 'disturbed': -2, 'disturbing': -2, 'dizzy': -1,
            'dodgy': -2, 'doubt': -1, 'doubted': -1, 'doubtful': -1, 'doubting': -1, 'doubts': -1,
            'drag': -1, 'dragged': -1, 'dread': -2, 'dreaded': -2, 'dreadful': -3, 'dreading': -2,
            'drop': -1, 'dumb': -3, 'dumbass': -3, 'dump': -1, 'dumped': -1, 'dupe': -2, 'duped': -2,
            'error': -2, 'errors': -2, 'evil': -3, 'exaggerate': -2, 'exaggerated': -2, 'excluded': -2,
            'excuse': -1, 'fake': -3, 'fail': -2, 'failed': -2, 'failing': -2, 'fails': -2,
            'failure': -2, 'failures': -2, 'fatigue': -2, 'fatigued': -2, 'fault': -2, 'fear': -2,
            'fearful': -2, 'fearing': -2, 'fears': -2, 'fed up': -3, 'feeble': -2, 'fraud': -4,
            'fraudster': -4, 'fraudulent': -4, 'freak': -2, 'fright': -2, 'frightened': -2,
            'frightening': -3, 'frustrated': -2, 'frustrating': -2, 'frustration': -2, 'fucking': -4,
            'furious': -3, 'greed': -3, 'greedy': -2, 'grief': -2, 'grieved': -2, 'gross': -2,
            'guilt': -3, 'guilty': -3, 'hacked': -2, 'hacking': -2, 'harass': -3, 'harassed': -3,
            'harassing': -3, 'harassment': -3, 'harm': -2, 'harmed': -2, 'harmful': -2, 'harming': -2,
            'harms': -2, 'hate': -3, 'hated': -3, 'hates': -3, 'hating': -3, 'hazard': -2,
            'hell': -4, 'helpless': -2, 'horrible': -3, 'horrific': -3, 'horrified': -3, 'hostile': -2,
            'hurt': -2, 'hurting': -2, 'hurts': -2, 'idiot': -3, 'idiotic': -3, 'ignorance': -2,
            'ignorant': -2, 'ignore': -1, 'ignored': -1, 'ignores': -1, 'ill': -2, 'illegal': -3,
            'impatient': -2, 'imperfect': -2, 'impersonal': -2, 'impolite': -2, 'impose': -1,
            'imposed': -1, 'imposes': -1, 'imposing': -1, 'impotent': -2, 'incapable': -2,
            'incapacitated': -2, 'incompetence': -2, 'incompetent': -2, 'inconvenience': -2,
            'inconvenient': -2, 'ineffective': -2, 'inefficient': -2, 'inferior': -2, 'inflated': -2,
            'infringement': -2, 'infuriate': -2, 'infuriated': -2, 'infuriates': -2, 'infuriating': -2,
            'insane': -2, 'insanity': -2, 'insecure': -2, 'insensitive': -2, 'insincerity': -2,
            'insult': -2, 'insulted': -2, 'insulting': -2, 'insults': -2, 'interruption': -2,
            'interrupt': -2, 'interrupted': -2, 'intimidate': -2, 'intimidated': -2, 'intimidates': -2,
            'intimidating': -2, 'intimidation': -2, 'irresponsible': -2, 'irritate': -3,
            'irritated': -3, 'irritating': -3, 'isolated': -1, 'joke': -2, 'kill': -3, 'killed': -3,
            'killing': -3, 'kills': -3, 'lack': -2, 'lacked': -2, 'lacking': -2, 'lacks': -2,
            'lag': -1, 'lagging': -2, 'lags': -2, 'lame': -2, 'lazy': -1, 'leak': -1, 'leaked': -1,
            'leave': -1, 'liar': -3, 'liars': -3, 'lie': -1, 'lied': -2, 'lies': -1, 'limitation': -1,
            'limited': -1, 'limits': -1, 'litigation': -1, 'long': -1, 'lose': -3, 'loses': -3,
            'losing': -3, 'loss': -3, 'lost': -3, 'lunatic': -3, 'mad': -3, 'mess': -2, 'messed': -2,
            'messing': -2, 'mistake': -2, 'mistaken': -2, 'mistakes': -2, 'mistaking': -2,
            'misunderstanding': -2, 'misunderstood': -2, 'moan': -2, 'moaned': -2, 'moaning': -2,
            'moans': -2, 'mock': -2, 'mocked': -2, 'mocking': -2, 'mocks': -2, 'moron': -3,
            'neglect': -2, 'neglected': -2, 'neglecting': -2, 'neglects': -2, 'nervous': -2,
            'no': -1, 'nonsense': -2, 'not': -1, 'obnoxious': -3, 'offence': -2, 'offend': -2,
            'offended': -2, 'offender': -2, 'offending': -2, 'offends': -2, 'offline': -1,
            'pain': -2, 'pained': -2, 'painful': -2, 'panic': -3, 'pathetic': -2, 'penalty': -2,
            'piss': -4, 'pissed': -4, 'plea': -2, 'poor': -2, 'problem': -2, 'problems': -2,
            'profiteer': -2, 'protest': -2, 'protested': -2, 'protesting': -2, 'protests': -2,
            'punish': -2, 'punished': -2, 'punishes': -2, 'punitive': -2, 'quit': -1, 'rage': -2,
            'raged': -2, 'rages': -2, 'raging': -2, 'ranter': -3, 'ranters': -3, 'rants': -3,
            'rape': -4, 'raped': -4, 'rapist': -4, 'refuse': -2, 'refused': -2, 'refusing': -2,
            'reject': -1, 'rejected': -1, 'rejecting': -1, 'rejects': -1, 'rejection': -2,
            'remove': -1, 'removed': -1, 'removing': -1, 'resign': -1, 'resigned': -1, 'resigning': -1,
            'resigns': -1, 'ridiculous': -3, 'rig': -1, 'rigged': -1, 'risk': -2, 'risks': -2,
            'risky': -2, 'rob': -2, 'robbed': -2, 'robber': -2, 'robbing': -2, 'robs': -2,
            'rude': -2, 'ruin': -2, 'ruined': -2, 'ruining': -2, 'ruins': -2, 'sad': -2,
            'saddened': -2, 'sadly': -2, 'scam': -3, 'scams': -3, 'scandal': -3, 'scandalous': -3,
            'scandals': -3, 'scared': -2, 'scary': -2, 'sceptical': -2, 'scream': -2, 'screamed': -2,
            'screaming': -2, 'screams': -2, 'screwed': -2, 'selfish': -3, 'serious': -1,
            'severe': -2, 'shame': -2, 'shamed': -2, 'shameful': -2, 'shit': -4, 'shitty': -3,
            'shock': -2, 'shocked': -2, 'shocking': -2, 'shocks': -2, 'shut': -1, 'sick': -2,
            'sicken': -2, 'sickened': -2, 'sickening': -2, 'sickens': -2, 'silly': -1, 'skeptic': -2,
            'skeptical': -2, 'skepticism': -2, 'skeptics': -2, 'slam': -2, 'slash': -2, 'slashed': -2,
            'slashes': -2, 'slashing': -2, 'slow': -2, 'slowly': -2, 'spam': -2, 'spammer': -3,
            'spamming': -2, 'stolen': -2, 'stop': -1, 'stopped': -1, 'stopping': -1, 'stops': -1,
            'strain': -1, 'stress': -1, 'stressed': -2, 'stressful': -2, 'stressor': -2, 'stuck': -2,
            'stupid': -2, 'suck': -3, 'sucked': -3, 'sucks': -3, 'suffer': -2, 'suffered': -2,
            'suffering': -2, 'suffers': -2, 'suspect': -1, 'suspected': -1, 'suspecting': -1,
            'suspects': -1, 'suspicious': -2, 'terrible': -3, 'terrified': -3, 'terror': -3,
            'terrorized': -3, 'terrorizes': -3, 'threat': -2, 'threaten': -2, 'threatened': -2,
            'threatening': -2, 'threats': -2, 'tired': -2, 'trouble': -2, 'troubled': -2,
            'troubles': -2, 'ugly': -3, 'unacceptable': -2, 'unappreciated': -2, 'unapproved': -2,
            'unaware': -2, 'unbelievable': -1, 'unbelieving': -1, 'unbiased': 2, 'uncertain': -1,
            'unclear': -1, 'uncomfortable': -2, 'unconcerned': -2, 'unconfirmed': -1, 'unconvinced': -1,
            'underestimate': -1, 'underestimated': -1, 'unhappy': -2, 'unjust': -2, 'unlovable': -2,
            'unloved': -2, 'unpaid': -2, 'unprofessional': -2, 'unprotected': -2, 'unresponsive': -2,
            'unsatisfied': -2, 'unstable': -2, 'unsupported': -2, 'unwanted': -2, 'unworthy': -2,
            'upset': -2, 'upsets': -2, 'upsetting': -2, 'uptight': -2, 'useless': -2, 'victim': -3,
            'victimized': -3, 'victims': -3, 'violate': -2, 'violated': -2, 'violates': -2,
            'violating': -2, 'violation': -2, 'violations': -2, 'violence': -3, 'violent': -3,
            'wait': -1, 'waited': -1, 'waiting': -1, 'warning': -3, 'warned': -2, 'waste': -1,
            'wasted': -1, 'wasting': -1, 'weak': -2, 'weakness': -2, 'worst': -3, 'worthless': -2,
            'wrong': -2, 'wtf': -4, 'worry': -2, 'worried': -2, 'worrying': -2,

            // Positive (1 to 5)
            'amazing': 4, 'appreciate': 2, 'appreciated': 2, 'appreciates': 2, 'appreciating': 2,
            'appreciation': 2, 'awesome': 4, 'beautiful': 3, 'best': 3, 'better': 2, 'brilliant': 4,
            'calm': 2, 'calmed': 2, 'calming': 2, 'calms': 2, 'celebrate': 3, 'celebrated': 3,
            'celebrates': 3, 'celebrating': 3, 'cheer': 2, 'cheered': 2, 'cheerful': 2, 'cheering': 2,
            'cheers': 2, 'clarity': 2, 'clever': 2, 'comfort': 2, 'comfortable': 2, 'comforting': 2,
            'committed': 1, 'confidence': 2, 'confident': 2, 'congratulate': 2, 'congratulation': 2,
            'congratulations': 2, 'cool': 1, 'courteous': 2, 'creative': 2, 'credit': 2, 'cute': 2,
            'thank': 2, 'thanks': 2, 'thankful': 2, 'dedicated': 2, 'delight': 3, 'delighted': 3,
            'delighting': 3, 'delights': 3, 'easy': 1, 'effective': 2, 'effectively': 2, 'efficient': 2,
            'elegant': 2, 'encouraged': 2, 'encouragement': 2, 'encouraging': 2, 'enhance': 2,
            'enjoy': 2, 'enjoyed': 2, 'enjoying': 2, 'enjoys': 2, 'ensure': 1, 'entitled': 1,
            'excellent': 3, 'excited': 3, 'excitement': 3, 'exciting': 3, 'fabulous': 4, 'fair': 2,
            'faith': 1, 'fantastic': 4, 'favor': 2, 'favored': 2, 'favorite': 2, 'favorited': 2,
            'favorites': 2, 'favors': 2, 'fearless': 2, 'fine': 2, 'fit': 1, 'fresh': 1, 'friendly': 2,
            'fun': 4, 'funny': 4, 'generous': 2, 'glad': 3, 'good': 3, 'great': 3, 'greater': 3,
            'greatest': 3, 'happy': 3, 'happiness': 3, 'helpful': 2, 'hero': 2, 'honor': 2,
            'honored': 2, 'honoring': 2, 'honour': 2, 'honoured': 2, 'honouring': 2, 'hope': 2,
            'hopeful': 2, 'hopefully': 2, 'hopes': 2, 'hoping': 2, 'hug': 2, 'hugs': 2,
            'important': 2, 'impressed': 3, 'impressive': 3, 'improve': 2, 'improved': 2,
            'improvement': 2, 'improves': 2, 'improving': 2, 'incredible': 4, 'intelligent': 2,
            'interested': 2, 'interesting': 2, 'intricate': 2, 'invite': 1, 'inviting': 1,
            'joy': 3, 'joyful': 3, 'justice': 2, 'kind': 2, 'laugh': 1, 'laughing': 1, 'laughs': 1,
            'like': 2, 'liked': 2, 'likes': 2, 'love': 3, 'loved': 3, 'loves': 3, 'loving': 2,
            'lucky': 3, 'luxury': 2, 'mercy': 2, 'nice': 3, 'outstanding': 5, 'perfect': 3,
            'perfectly': 3, 'pleasant': 3, 'please': 1, 'pleased': 3, 'pleasure': 3, 'popular': 3,
            'positive': 2, 'positively': 2, 'powerful': 2, 'prize': 2, 'proud': 2, 'promise': 1,
            'protect': 1, 'protected': 1, 'protection': 1, 'protects': 1, 'proudly': 2,
            'recommend': 2, 'recommended': 2, 'recommends': 2, 'refreshing': 2, 'relaxed': 2,
            'reliable': 2, 'relief': 1, 'relieved': 2, 'resolve': 2, 'resolved': 2, 'resolves': 2,
            'resolving': 2, 'respect': 2, 'respected': 2, 'respects': 2, 'responsible': 2,
            'reward': 2, 'rewarded': 2, 'rewarding': 2, 'rewards': 2, 'rich': 2, 'safe': 1,
            'safely': 1, 'safety': 1, 'satisfied': 2, 'secure': 2, 'secured': 2, 'secures': 2,
            'security': 1, 'share': 1, 'shared': 1, 'shares': 1, 'significant': 1, 'smart': 1,
            'smile': 2, 'smiled': 2, 'smiles': 2, 'smiling': 2, 'solid': 2, 'solution': 1,
            'solutions': 1, 'solve': 1, 'solved': 1, 'solves': 1, 'solving': 1, 'sophisticated': 2,
            'stable': 2, 'strength': 2, 'strengthen': 2, 'strong': 2, 'stronger': 2, 'strongest': 2,
            'success': 2, 'successful': 3, 'successfully': 3, 'super': 3, 'support': 2,
            'supported': 2, 'supporting': 2, 'supports': 2, 'sure': 1, 'survived': 2, 'surviving': 2,
            'survivor': 2, 'sweet': 2, 'talent': 2, 'terrific': 4, 'thankful': 2, 'thoughtful': 2,
            'thrilled': 5, 'top': 2, 'trust': 1, 'trusted': 2, 'trusting': 1, 'trusts': 1,
            'understand': 1, 'understanding': 2, 'understood': 1, 'useful': 2, 'valuable': 2,
            'value': 1, 'valued': 2, 'values': 1, 'wealth': 3, 'wealthy': 2, 'welcome': 2,
            'welcomed': 2, 'welcomes': 2, 'welcoming': 2, 'well': 2, 'willing': 2, 'win': 4,
            'winner': 4, 'winning': 4, 'wins': 4, 'wonderful': 4, 'won': 3, 'worth': 2, 'worthy': 2,
            'wow': 4, 'yes': 1
        };
    }

    /**
     * Analyze text for sentiment
     * @param {string} text - Text to analyze
     * @returns {object} - {score: number, comparative: number, words: array, positive: array, negative: array}
     */
    analyze(text) {
        if (!text || typeof text !== 'string') {
            return {
                score: 0,
                comparative: 0,
                words: [],
                positive: [],
                negative: []
            };
        }

        const tokens = text.toLowerCase().match(/\b[\w']+\b/g) || [];
        let score = 0;
        const words = [];
        const positive = [];
        const negative = [];

        tokens.forEach(token => {
            if (this.afinn.hasOwnProperty(token)) {
                const itemScore = this.afinn[token];
                words.push(token);
                if (itemScore > 0) positive.push(token);
                if (itemScore < 0) negative.push(token);
                score += itemScore;
            }
        });

        // Calculate comparative score (normalized by length)
        let comparative = tokens.length > 0 ? score / tokens.length : 0;

        // Normalize comparative score to be roughly between -1 and 1
        // Usually scores are small, e.g. -0.2 to 0.5
        // We ensure it reflects the intensity correctly

        return {
            score,
            comparative,
            words,
            positive,
            negative
        };
    }
}
